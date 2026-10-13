import 'package:cloud_firestore/cloud_firestore.dart';

/// Core `chats/{a__b}` ani `messages` — web `src/api/chat.ts` sobat same shape.

String chatIdOf(String a, String b) => ([a, b]..sort()).join('__');

DateTime? _date(Object? v) => v is Timestamp ? v.toDate() : null;

/// `{uid: Timestamp}` → `{uid: DateTime}`.
Map<String, DateTime> _stamps(Object? v) => {
  for (final e in ((v as Map?) ?? const {}).entries)
    if (e.value is Timestamp) '${e.key}': (e.value as Timestamp).toDate(),
};

class ChatUser {
  const ChatUser({required this.uid, required this.name, required this.email, this.role});

  factory ChatUser.fromMap(Map<Object?, Object?> m) =>
      ChatUser(uid: '${m['uid']}', name: '${m['name'] ?? ''}', email: '${m['email'] ?? ''}', role: m['role'] as String?);

  final String uid;
  final String name;
  final String email;
  final String? role;

  String get label => name.isNotEmpty ? name : email;
}

/// Chat list madhli ek entry — 1:1 (`other` = samorcha uid) kinva group.
class ChatSummary {
  const ChatSummary({
    required this.id,
    required this.other,
    required this.lastText,
    required this.lastBy,
    required this.lastAttachment,
    required this.updatedAt,
    required this.unread,
    this.isGroup = false,
    this.name = '',
    this.members = const [],
    this.admins = const [],
    this.names = const {},
    this.lastByName = '',
    this.lastSystem = false,
    this.lastDeleted = false,
    this.reads = const {},
    this.delivered = const {},
    this.description = '',
    this.photo,
    this.notify = const {},
    this.muted = const [],
    this.onlyAdminsSend = false,
    this.createdBy = '',
    this.createdAt,
    this.unreadCount = 0,
    this.mentioned = false,
    this.lastMentions = const [],
    this.lastReplyToBy,
  });

  factory ChatSummary.fromDoc(DocumentSnapshot<Map<String, dynamic>> d, String me) {
    final x = d.data() ?? const {};
    final updatedAt = _date(x['updatedAt']);
    final read = _date((x['reads'] as Map?)?[me]);
    final last = (x['last'] as Map?) ?? const {};
    final lastBy = '${last['by'] ?? ''}';
    final members = ((x['members'] as List?) ?? const []).cast<String>();
    return ChatSummary(
      id: d.id,
      other: x['type'] == 'group' ? '' : members.firstWhere((m) => m != me, orElse: () => ''),
      lastText: '${last['text'] ?? ''}',
      lastBy: lastBy,
      lastAttachment: last['attachment'] as String?,
      updatedAt: updatedAt,
      unread: lastBy != me && updatedAt != null && (read == null || read.isBefore(updatedAt)),
      isGroup: x['type'] == 'group',
      name: '${x['name'] ?? ''}',
      members: members,
      admins: ((x['admins'] as List?) ?? const []).cast<String>(),
      names: ((x['names'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      lastByName: '${last['byName'] ?? ''}',
      lastSystem: last['system'] == true,
      lastDeleted: last['deleted'] == true,
      reads: _stamps(x['reads']),
      delivered: _stamps(x['delivered']),
      description: '${x['description'] ?? ''}',
      photo: x['photo'] is String ? x['photo'] as String : null,
      notify: ((x['notify'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      muted: ((x['muted'] as List?) ?? const []).cast<String>(),
      onlyAdminsSend: x['onlyAdminsSend'] == true,
      createdBy: '${x['createdBy'] ?? ''}',
      createdAt: _date(x['createdAt']),
      unreadCount: lastBy != me && updatedAt != null && (read == null || read.isBefore(updatedAt))
          ? (((x['unread'] as Map?)?[me] as num?)?.toInt() ?? 1).clamp(1, 1 << 30)
          : 0,
      mentioned: lastBy != me && updatedAt != null && (read == null || read.isBefore(updatedAt)) && (x['mentionUnread'] as Map?)?[me] == true,
      lastMentions: ((last['mentions'] as List?) ?? const []).cast<String>(),
      lastReplyToBy: last['replyToBy'] as String?,
    );
  }

  // Group settings (web sarkhe).
  final String description;

  /// Storage path (`chat/{id}/{uid}/group-photo-*`).
  final String? photo;

  /// uid → all / mentions / off.
  final Map<String, String> notify;
  final List<String> muted;
  final bool onlyAdminsSend;
  final String createdBy;
  final DateTime? createdAt;

  /// Na vachlele (server counter) / mala mention.
  final int unreadCount;
  final bool mentioned;
  final List<String> lastMentions;
  final String? lastReplyToBy;

  /// Majhi notification nivad — all / mentions / off.
  String notifyFor(String me) => notify[me] ?? (muted.contains(me) ? 'off' : 'all');

  /// uid → shevti vachla / ya device var pohochla (watermark — ✓✓).
  final Map<String, DateTime> reads;
  final Map<String, DateTime> delivered;

  /// Majhya device var shevti pohochla (vachla tar to pan).
  DateTime? deliveredFor(String me) {
    final a = delivered[me], b = reads[me];
    if (a == null) return b;
    if (b == null) return a;
    return a.isAfter(b) ? a : b;
  }

  /// List madhla ✓ — shevatcha (majha) message sagle recipients ni vachla / milala ka (watermark).
  Receipt lastReceipt(String me) {
    final at = updatedAt;
    final others = members.where((m) => m != me).toList();
    if (at == null || others.isEmpty) return Receipt.sent;
    bool upTo(Map<String, DateTime> w, String u) => !(w[u]?.isBefore(at) ?? true);
    if (others.every((u) => upTo(reads, u))) return Receipt.read;
    if (others.every((u) => upTo(reads, u) || upTo(delivered, u))) return Receipt.delivered;
    return Receipt.sent;
  }

  final String id;
  final String other;
  final String lastText;
  final String lastBy;
  final String? lastAttachment;
  final DateTime? updatedAt;
  final bool unread;

  // Group
  final bool isGroup;
  final String name;
  final List<String> members;
  final List<String> admins;

  /// uid → naav (group members).
  final Map<String, String> names;
  final String lastByName;
  final bool lastSystem;
  final bool lastDeleted;

  String get preview {
    if (lastDeleted) return '🚫 Message deleted';
    if (lastText.isNotEmpty) return lastText;
    if (lastAttachment == '🎤') return '🎤 Voice message';
    return lastAttachment != null ? '📎 $lastAttachment' : '';
  }
}

class ChatAttachment {
  const ChatAttachment({required this.path, required this.name, required this.size, required this.type, this.duration});

  factory ChatAttachment.fromMap(Map<Object?, Object?> m) => ChatAttachment(
    path: '${m['path']}',
    name: '${m['name'] ?? ''}',
    size: (m['size'] as num?)?.toInt() ?? 0,
    type: '${m['type'] ?? ''}',
    duration: (m['duration'] as num?)?.toInt(),
  );

  final String path;
  final String name;
  final int size;
  final String type;

  /// Voice message (sec).
  final int? duration;

  bool get isAudio => type.startsWith('audio/');
  bool get isImage => type.startsWith('image/');
  bool get isVideo => type.startsWith('video/');
}

/// Reply kelelya message chi chhoti copy.
class ChatReply {
  const ChatReply({required this.id, required this.by, required this.byName, required this.text, this.attachment, this.audio = false});

  factory ChatReply.fromMap(Map<Object?, Object?> m) => ChatReply(
    id: '${m['id']}',
    by: '${m['by'] ?? ''}',
    byName: '${m['byName'] ?? ''}',
    text: '${m['text'] ?? ''}',
    attachment: m['attachment'] as String?,
    audio: m['audio'] == true,
  );

  final String id;
  final String by;
  final String byName;
  final String text;
  final String? attachment;
  final bool audio;

  String get preview => text.isNotEmpty ? text : (audio ? '🎤 Voice message' : (attachment != null ? '📎 $attachment' : ''));
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.by,
    required this.byName,
    required this.text,
    this.attachment,
    this.replyTo,
    this.at,
    this.deleted = false,
    this.system = false,
    this.hiddenFor = const [],
    this.to,
    this.mentions = const [],
    this.call,
    this.reactions = const {},
    this.forwarded = false,
    this.starred = false,
    this.deliveredTo = const {},
    this.readBy = const {},
  });

  factory ChatMessage.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final x = d.data() ?? const {};
    return ChatMessage(
      id: d.id,
      by: '${x['by'] ?? ''}',
      byName: '${x['byName'] ?? ''}',
      text: '${x['text'] ?? ''}',
      attachment: x['attachment'] is Map ? ChatAttachment.fromMap(x['attachment'] as Map) : null,
      replyTo: x['replyTo'] is Map ? ChatReply.fromMap(x['replyTo'] as Map) : null,
      at: _date(x['at']),
      deleted: x['deleted'] == true,
      system: x['kind'] == 'system',
      hiddenFor: ((x['hiddenFor'] as List?) ?? const []).cast<String>(),
      to: (x['to'] as List?)?.cast<String>(),
      mentions: ((x['mentions'] as List?) ?? const []).cast<String>(),
      call: x['kind'] == 'call' && x['call'] is Map ? CallInfo.fromMap(x['call'] as Map) : null,
      reactions: ((x['reactions'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      forwarded: x['forwarded'] == true,
      deliveredTo: _stamps(x['deliveredTo']),
      readBy: _stamps(x['readBy']),
    );
  }

  /// Pathavla tevha che recipients (juna message la null).
  final List<String>? to;

  /// Group — `@` kelele members (uid).
  final List<String> mentions;

  /// Call history (`kind: "call"`) — pathavnara = caller.
  final CallInfo? call;

  /// uid → emoji.
  final Map<String, String> reactions;
  final bool forwarded;

  /// Mi star kelela (fakt majha — `admins/{me}/starred`).
  final bool starred;

  ChatMessage withStarred(bool v) => ChatMessage(
    id: id,
    by: by,
    byName: byName,
    text: text,
    attachment: attachment,
    replyTo: replyTo,
    at: at,
    deleted: deleted,
    system: system,
    hiddenFor: hiddenFor,
    to: to,
    mentions: mentions,
    call: call,
    reactions: reactions,
    forwarded: forwarded,
    starred: v,
    deliveredTo: deliveredTo,
    readBy: readBy,
  );

  /// uid → vel — tya member chya device var pohochla / tyane vachla.
  final Map<String, DateTime> deliveredTo;
  final Map<String, DateTime> readBy;

  /// ✓ / ✓✓ / blue ✓✓ — web `receiptStatus` sarkha: pratyek recipient vegla (pathavla tevha che,
  /// ajun member). Juna message (receipt nahi) — chat watermark.
  Receipt receipt(ChatSummary? chat, List<String> members) {
    final at = this.at;
    if (at == null) return Receipt.sent;
    final who = (to ?? members).where((u) => u != by && members.contains(u)).toList();
    if (who.isEmpty) return Receipt.sent;
    bool upTo(Map<String, DateTime>? w, String u) => !(w?[u]?.isBefore(at) ?? true);
    bool read(String u) => readBy.containsKey(u) || upTo(chat?.reads, u);
    bool got(String u) => read(u) || deliveredTo.containsKey(u) || upTo(chat?.delivered, u);
    if (who.every(read)) return Receipt.read;
    if (who.every(got)) return Receipt.delivered;
    return Receipt.sent;
  }

  final String id;
  final String by;
  final String byName;
  final String text;
  final ChatAttachment? attachment;
  final ChatReply? replyTo;
  final DateTime? at;

  /// "Delete for everyone" zalela.
  final bool deleted;

  /// Group madhla "X ne group banavla" sarkha message.
  final bool system;

  /// "Delete for me" kelele users.
  final List<String> hiddenFor;

  String get preview {
    if (text.isNotEmpty) return text;
    final a = attachment;
    if (a == null) return '';
    return a.isAudio ? '🎤 Voice message' : '📎 ${a.name}';
  }
}

/// ✓ sent (server var save) · ✓✓ delivered (recipient chya device var) · blue ✓✓ read.
enum Receipt { sent, delivered, read }

/// Chat madhli call history entry.
class CallInfo {
  const CallInfo({required this.type, required this.outcome, required this.duration});
  factory CallInfo.fromMap(Map<Object?, Object?> m) =>
      CallInfo(type: '${m['type'] ?? 'audio'}', outcome: '${m['outcome'] ?? ''}', duration: (m['duration'] as num?)?.toInt() ?? 0);

  /// audio / video.
  final String type;

  /// completed / missed / declined / cancelled / busy / failed.
  final String outcome;
  final int duration;
}
