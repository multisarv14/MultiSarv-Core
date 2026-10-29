import 'dart:async';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:mime/mime.dart';

import '../core/backend.dart';
import 'models.dart';

/// Core storage.rules / functions `chat.ts` sobat same.
const chatMaxBytes = 10 * 1024 * 1024;
const chatVideoMaxBytes = 50 * 1024 * 1024;
const chatApkMaxBytes = 100 * 1024 * 1024;
const _apkType = 'application/vnd.android.package-archive';

/// Video 50 MB, APK 100 MB, baki 10 MB.
int chatMaxFor(String type) => type.startsWith('video/') ? chatVideoMaxBytes : (type == _apkType ? chatApkMaxBytes : chatMaxBytes);
final _types = [
  RegExp(r'^application/vnd\.android\.package-archive$'),
  RegExp(r'^image/(png|jpe?g|gif|webp)$'),
  RegExp(r'^application/pdf$'),
  RegExp(r'^text/(plain|csv)$'),
  RegExp(
    r'^application/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)$',
  ),
  RegExp(r'^application/(zip|x-zip-compressed)$'),
  RegExp(r'^audio/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)$'),
  RegExp(r'^video/(mp4|quicktime|webm|3gpp)$'),
];

/// Server la chalnara content type — nahi tar null.
String? chatContentType(String fileName) {
  final ext = fileName.split('.').last.toLowerCase();
  // `mime` m4a la `audio/x-m4a` deto — voice note sathi audio/mp4. mp4 = video.
  final type = ext == 'm4a' ? 'audio/mp4' : (ext == 'mov' ? 'video/quicktime' : lookupMimeType(fileName));
  return type != null && _types.any((r) => r.hasMatch(type)) ? type : null;
}

/// Internal Chat — fakt Core Users. Vachne Firestore madhun (rules), lihne core functions.
class ChatRepository {
  final _db = FirebaseFirestore.instance;
  final _storage = FirebaseStorage.instance;

  Future<List<ChatUser>>? _users;

  /// Itar active Core Users (ekda; `fresh` ne punha).
  Future<List<ChatUser>> users({bool fresh = false}) {
    if (_users == null || fresh) {
      _users = callCore<List<Object?>>('listChatUsers').then((l) => l.map((e) => ChatUser.fromMap(e as Map)).toList());
      _users!.catchError((Object _) {
        _users = null;
        return <ChatUser>[];
      });
    }
    return _users!;
  }

  void clear() => _users = null;

  Stream<List<ChatSummary>> myChats(String me) =>
      _db.collection('chats').where('members', arrayContains: me).snapshots().map((s) => s.docs.map((d) => ChatSummary.fromDoc(d, me)).toList());

  /// Ek chat live (group info — naav / members badalle ki).
  Stream<ChatSummary?> chat(String chatId, String me) =>
      _db.collection('chats').doc(chatId).snapshots().map((d) => d.exists ? ChatSummary.fromDoc(d, me) : null);

  /// Shevatche `limit` messages, juna → navin ("Delete for me" kelele sodun) — mi star kelele chinh sobat.
  Stream<List<ChatMessage>> messages(String chatId, String me, {int limit = 300}) {
    late StreamController<List<ChatMessage>> c;
    StreamSubscription<Object?>? a, b;
    var list = <ChatMessage>[];
    var stars = <String>{};
    void emit() {
      if (!c.isClosed) c.add([for (final m in list) stars.contains(m.id) ? m.withStarred(true) : m]);
    }

    c = StreamController<List<ChatMessage>>(
      onListen: () {
        a = _db
            .collection('chats')
            .doc(chatId)
            .collection('messages')
            .orderBy('at')
            .limitToLast(limit)
            .snapshots()
            .listen((s) {
              list = s.docs.map(ChatMessage.fromDoc).where((m) => !m.hiddenFor.contains(me)).toList();
              emit();
            }, onError: c.addError);
        b = starredIds(chatId, me).listen((s) {
          stars = s;
          emit();
        }, onError: (Object _) {});
      },
      onCancel: () async {
        await a?.cancel();
        await b?.cancel();
        await c.close();
      },
    );
    return c.stream;
  }

  /// Mi star kelele message ids (fakt mala disto).
  Stream<Set<String>> starredIds(String chatId, String me) => _db
      .collection('admins')
      .doc(me)
      .collection('starred')
      .doc(chatId)
      .snapshots()
      .map((d) => (((d.data() ?? const {})['ids'] as List?) ?? const []).map((e) => '$e').toSet());

  /// `emoji: null` = majhi reaction kadha.
  Future<void> react(String chatId, String id, String? emoji) => callCore<Object?>('reactChatMessage', {'chatId': chatId, 'id': id, 'emoji': emoji});

  Future<void> star(String chatId, List<String> ids, bool starred) =>
      callCore<Object?>('starChatMessages', {'chatId': chatId, 'ids': ids, 'starred': starred});

  /// Kamal 10 messages, 5 chats. Target: `{'to': uid}` kinva `{'chatId': id}`.
  Future<void> forward(String chatId, List<String> ids, List<Map<String, String>> targets) =>
      callCore<Object?>('forwardChatMessages', {'chatId': chatId, 'ids': ids, 'targets': targets});

  /// all / mentions / off — fakt majhyasathi.
  Future<void> setNotify(String chatId, String mode) => callCore<Object?>('setChatNotify', {'chatId': chatId, 'mode': mode});

  /// Group photo — chhoti JPEG upload, mag group la (fakt admin; server tapasto).
  Future<void> setGroupPhoto(String me, String chatId, File file) async {
    final path = 'chat/$chatId/$me/group-photo-${DateTime.now().millisecondsSinceEpoch}.jpg';
    await _storage.ref(path).putFile(file, SettableMetadata(contentType: 'image/jpeg'));
    await updateGroup(chatId, photo: path);
  }

  final _photoUrls = <String, Future<String>>{};

  /// Group photo URL (path badalla tarach navin).
  Future<String> photoUrl(String path) => _photoUrls[path] ??= _storage.ref(path).getDownloadURL()..catchError((Object _) {
    _photoUrls.remove(path);
    return '';
  });

  /// File Storage la (swatahchya folder madhe), mag message. `duration` = voice message (sec).
  /// 1:1 → `to`; group → `groupId`.
  Future<void> send({
    required String me,
    String? to,
    String? groupId,
    required String text,
    File? file,
    String? fileName,
    String? replyTo,
    int? duration,
    List<String> mentions = const [],
  }) async {
    Map<String, dynamic>? attachment;
    if (file != null) {
      final name = fileName ?? file.uri.pathSegments.last;
      final type = chatContentType(name);
      if (type == null) throw AppError('This file type isn\'t allowed. Use images, videos, PDF, text, Office or ZIP files.');
      final size = await file.length();
      if (size > chatMaxFor(type)) throw AppError('File is too large (max ${chatMaxFor(type) ~/ (1024 * 1024)} MB).');
      var safe = name.replaceAll(RegExp(r'[^\w.\- ]+'), '_');
      if (safe.length > 120) safe = safe.substring(safe.length - 120);
      final path = 'chat/${groupId ?? chatIdOf(me, to!)}/$me/${DateTime.now().millisecondsSinceEpoch}-$safe';
      await _storage.ref(path).putFile(file, SettableMetadata(contentType: type));
      attachment = {'path': path, 'name': name, 'duration': ?duration};
    }
    await callCore<Object?>('sendChatMessage', {'to': ?to, 'chatId': ?groupId, 'text': text, 'attachment': attachment, 'replyTo': replyTo, 'mentions': mentions});
  }

  /// `forEveryone` — fakt swatahcha message; nahitar fakt majhyasathi lapvto.
  Future<void> deleteMessage(String chatId, String id, {required bool forEveryone}) =>
      callCore<Object?>('deleteChatMessage', {'chatId': chatId, 'id': id, 'forEveryone': forEveryone});

  /// Swatahcha message edit (15 min aat — server tapasto).
  Future<void> editMessage(String chatId, String id, String text, List<String> mentions) =>
      callCore<Object?>('editChatMessage', {'chatId': chatId, 'id': id, 'text': text, 'mentions': mentions});

  /// Navin group → chat id.
  Future<String> createGroup(String name, List<String> members, {String description = ''}) async {
    final r = await callCore<Map<Object?, Object?>>('createChatGroup', {'name': name, 'members': members, 'description': description});
    return '${r['chatId']}';
  }

  /// Fakt group admin (server tapasto). `photo: ''` = photo kadha.
  Future<void> updateGroup(
    String chatId, {
    String? name,
    String? description,
    String? photo,
    List<String>? add,
    List<String>? remove,
    List<String>? promote,
    List<String>? demote,
    bool? onlyAdminsSend,
  }) => callCore<Object?>('updateChatGroup', {
    'chatId': chatId,
    'name': ?name,
    'description': ?description,
    if (photo != null) 'photo': photo.isEmpty ? null : photo,
    'add': ?add,
    'remove': ?remove,
    'promote': ?promote,
    'demote': ?demote,
    'onlyAdminsSend': ?onlyAdminsSend,
  });

  Future<void> leaveGroup(String chatId) => callCore<Object?>('leaveChatGroup', {'chatId': chatId});

  Future<void> markRead(String chatId) => callCore<Object?>('markChatRead', {'chatId': chatId});

  /// ✓✓ grey — navin messages ya device var pohochle (server watermark — duplicate nahi).
  Future<void> markDelivered(List<String> chatIds) =>
      chatIds.isEmpty ? Future.value() : callCore<Object?>('markChatDelivered', {'chatIds': chatIds.take(50).toList()});

  /// Attachment URL (storage rules — fakt chat members).
  Future<String> attachmentUrl(String path) => _storage.ref(path).getDownloadURL();
}
