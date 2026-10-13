import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/backend.dart';
import '../firebase_options.dart';
import 'call_service.dart' show showIncoming;

/// Chat push madhla chat id (test / ticket la nahi).
String? _chatIdOf(RemoteMessage m) {
  final id = m.data['chatId'];
  return m.data['kind'] != 'ticket' && id is String && id.isNotEmpty ? id : null;
}

/// ✓✓ grey — message ya phone var pohochla (push ala). Server watermark mule duplicate nahi.
Future<void> _ackDelivered(String chatId) async {
  try {
    await callCore<Object?>('markChatDelivered', {
      'chatIds': [chatId],
    });
  } catch (_) {}
}

/// App band / background astana push — incoming call → native ring screen; chat → "delivered".
@pragma('vm:entry-point')
Future<void> firebaseBackgroundPush(RemoteMessage m) async {
  final callId = m.data['callId'];
  if (m.data['kind'] == 'call' && callId is String && callId.isNotEmpty) {
    await showIncoming(callId, m.notification?.title ?? 'MultiSarv', m.data['callType'] == 'video');
    return;
  }
  // Missed / cancelled — ring thambva (tag `call-<id>`).
  final tag = '${m.data['tag'] ?? ''}';
  if (tag.startsWith('call-')) await FlutterCallkitIncoming.endCall(tag.substring(5)).catchError((Object _) {});
  final chatId = _chatIdOf(m);
  if (chatId == null) return;
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // Navin isolate — login state disk varun yeiparyant thamba.
  final user = FirebaseAuth.instance.currentUser ?? await FirebaseAuth.instance.authStateChanges().first.timeout(const Duration(seconds: 5), onTimeout: () => null);
  if (user == null) return;
  await _ackDelivered(chatId);
}

/// Server (`core/functions/src/chat.ts` → `pushTo`) hach channel id pathavto.
/// HIGH importance nasel tar Android background push la heads-up / sound yet nahi.
const _channel = AndroidNotificationChannel('chat', 'Chat messages', description: 'New Internal Chat messages', importance: Importance.high);
const _ticketChannel = AndroidNotificationChannel('tickets', 'Tickets', description: 'Tickets assigned to you', importance: Importance.high);

/// FCM (Internal Chat + Tickets). Server: phone app madhe login asel tar push FAKT phone var
/// (web la nahi); test notification — fakt ya phone var (`deviceId`).
///  - permission + channel, device token core la (`registerCorePush`) — ya phone cha sthir
///    `deviceId` + `platform` sobat, mhanje web login ha token pusat nahi
///  - app samor astana local notification (ughdya chat sodun)
///  - notification tap → tya person cha / group cha chat
class PushService {
  final _local = FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _tokenSub;
  bool _started = false;

  /// Notification tap → 1:1 (`from` uid) kinva group (`chatId`). App to chat ughadto.
  void Function({String? from, String? chatId, String? messageId})? onOpenChat;

  /// Notification tap → ticket (assign zala).
  void Function(String ticketId)? onOpenTicket;

  /// Sadhya screen var ughda ticket — tyache foreground alerts nako.
  String? openTicketId;

  static const _deviceKey = 'ms-core-push-device';
  String? _deviceId;

  /// Ya install cha sthir id (server var ya phone chi entry).
  Future<String> _device() async {
    if (_deviceId != null) return _deviceId!;
    final p = await SharedPreferences.getInstance();
    var id = p.getString(_deviceKey);
    if (id == null) {
      final r = Random.secure();
      id = '${_platform()}-${List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
      await p.setString(_deviceKey, id);
    }
    return _deviceId = id;
  }

  static String _platform() => Platform.isIOS ? 'ios' : 'android';

  /// Sadhya screen var ughda chat — tyache foreground alerts nako.
  String? openChatId;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    final messaging = FirebaseMessaging.instance;
    await _initLocal();
    await messaging.requestPermission();
    // iOS: foreground banner aapan local ne dakhavto (ughda chat sodun) — FCM cha nako (double).
    await messaging.setForegroundNotificationPresentationOptions(alert: false, badge: true, sound: false);

    await _register();
    _tokenSub = messaging.onTokenRefresh.listen((t) => _save(t));

    FirebaseMessaging.onMessage.listen(_showForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_open);
    final initial = await messaging.getInitialMessage();
    if (initial != null) _open(initial);
  }

  Future<void> _initLocal() async {
    try {
      await _local.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
        ),
        onDidReceiveNotificationResponse: (r) => _openPayload(r.payload),
      );
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(_channel);
      await android?.createNotificationChannel(_ticketChannel);
      final launch = await _local.getNotificationAppLaunchDetails();
      if (launch?.didNotificationLaunchApp == true) _openPayload(launch!.notificationResponse?.payload);
    } catch (e) {
      debugPrint('local notifications init failed: $e');
    }
  }

  Future<void> _register() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _save(token);
    } catch (e) {
      // Play Services nahi / iOS APNs key nahi — chat push shivay chalto.
      debugPrint('FCM token failed: $e');
    }
  }

  Future<void> _save(String token) async {
    try {
      await callCore<Object?>('registerCorePush', {'token': token, 'deviceId': await _device(), 'platform': _platform()});
    } catch (e) {
      debugPrint('registerCorePush failed: $e');
    }
  }

  Future<void> _showForeground(RemoteMessage m) async {
    // Incoming call — app ughda: `CallService` (Firestore) native ring dakhavto, notification nako.
    if (m.data['kind'] == 'call') return;
    final chatId = _chatIdOf(m);
    if (chatId != null) unawaited(_ackDelivered(chatId));
    final tag = m.data['tag'] as String?;
    final force = m.data['force'] == '1';
    if (!force && tag != null && openChatId != null && tag == 'chat-$openChatId') return;
    final ticketId = m.data['kind'] == 'ticket' ? m.data['ticketId'] as String? : null;
    if (!force && ticketId != null && ticketId == openTicketId) return;
    final channel = ticketId != null ? _ticketChannel : _channel;
    final title = m.notification?.title;
    if (title == null || title.isEmpty) return;
    final body = m.notification?.body ?? '';
    try {
      await _local.show(
        id: (tag ?? title).hashCode & 0x7fffffff,
        title: title,
        body: body,
        // `t:<ticketId>` = ticket, `g:<chatId>` = group, nahitar pathavnara uid.
        // `…#<messageId>` — tap kela ki tya message var.
        payload: ticketId != null
            ? 't:$ticketId'
            : '${m.data['chatId'] != null && !'${m.data['chatId']}'.contains('__') ? 'g:${m.data['chatId']}' : _from(m) ?? ''}'
                  '${m.data['messageId'] != null ? '#${m.data['messageId']}' : ''}',
        notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
            channel.id,
            channel.name,
            channelDescription: channel.description,
            importance: Importance.high,
            priority: Priority.high,
            tag: tag,
            styleInformation: BigTextStyleInformation(body),
          ),
          iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true, threadIdentifier: tag),
        ),
      );
    } catch (_) {}
  }

  void _open(RemoteMessage m) {
    final ticketId = m.data['ticketId'] as String?;
    if (m.data['kind'] == 'ticket' && ticketId != null) return onOpenTicket?.call(ticketId);
    final chatId = m.data['chatId'] as String?;
    // Mention / reply — thet tya message var.
    final messageId = m.data['messageId'] as String?;
    if (chatId != null && !chatId.contains('__')) return onOpenChat?.call(chatId: chatId, messageId: messageId);
    final from = _from(m);
    if (from != null && from.isNotEmpty) onOpenChat?.call(from: from, messageId: messageId);
  }

  /// Pathavnara uid — `fromUid` (server), nahitar link `/chat?with=<uid>`.
  static String? _from(RemoteMessage m) =>
      (m.data['fromUid'] as String?) ?? Uri.tryParse('${m.data['link'] ?? ''}')?.queryParameters['with'];

  void _openPayload(String? raw) {
    if (raw == null || raw.isEmpty) return;
    if (raw.startsWith('t:')) return onOpenTicket?.call(raw.substring(2));
    // `…#<messageId>` — tya message var.
    final hash = raw.indexOf('#');
    final p = hash < 0 ? raw : raw.substring(0, hash);
    final messageId = hash < 0 ? null : raw.substring(hash + 1);
    p.startsWith('g:') ? onOpenChat?.call(chatId: p.substring(2), messageId: messageId) : onOpenChat?.call(from: p, messageId: messageId);
  }

  /// Test notification (web "Send test notification" sarkha). Token / nondni fail zali tar
  /// kharे karan [AppError] madhe (lapvat nahi) — "kuthe adakla" disto.
  Future<({int devices, int sent, List<String> platforms})> test() async {
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      throw AppError('Notifications are blocked for MultiSarv — turn them on in phone Settings → Apps → MultiSarv → Notifications.');
    }
    String? token;
    try {
      token = await FirebaseMessaging.instance.getToken();
    } catch (e) {
      throw AppError("This phone couldn't get a notification token ($e). Check internet / Google Play services and try again.");
    }
    if (token == null) throw AppError("This phone couldn't get a notification token. Check internet / Google Play services and try again.");
    await callCore<Object?>('registerCorePush', {'token': token, 'deviceId': await _device(), 'platform': _platform()});
    // Fakt ya phone var (web var nahi).
    final r = await callCore<Map<Object?, Object?>>('testCorePush', {'deviceId': await _device()});
    return (
      devices: (r['devices'] as num?)?.toInt() ?? 0,
      sent: (r['sent'] as num?)?.toInt() ?? 0,
      platforms: ((r['platforms'] as List?) ?? const []).map((e) => '$e').toList(),
    );
  }

  /// Logout — ya phone la dusryache messages yeu naye.
  Future<void> stop() async {
    _tokenSub?.cancel();
    _started = false;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await callCore<Object?>('registerCorePush', {'token': token, 'remove': true, 'deviceId': await _device(), 'platform': _platform()});
      }
      await FirebaseMessaging.instance.deleteToken();
    } catch (_) {
      // Offline — server mrut token nantar kadhto.
    }
  }
}
