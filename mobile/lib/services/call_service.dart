import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../app/locator.dart';
import '../data/call_repository.dart';
import '../features/call/call_view.dart';

/// 1:1 Audio / Video calls — web `src/lib/callEngine.ts` sarkhach (same server, mhanun
/// phone ↔ phone ani phone ↔ web chalto). Media WebRTC (peer-to-peer), signalling Firestore.
/// Incoming ring — phone cha native call screen (`flutter_callkit_incoming`): app ughda,
/// background kinva (Android) band asel tari.

enum CallPhase { starting, calling, ringing, incoming, connecting, connected, reconnecting, ended }

/// permission / noDevice / network / server.
enum CallError { permission, noDevice, network, server }

/// Native call screen (`flutter_callkit_incoming`) cha id. iOS CallKit fakt UUID ghetto — Firestore
/// call id (20 akshare) dila tar plugin "invalid UUID" mhanun call sodun deto (ring nahi). Mhanun
/// call id varun nehmi tech UUID (Android la pan, ekach niyam); khara id `extra.callId` madhe.
String callkitId(String callId) {
  var a = 0xcbf29ce484222325, b = 0x6c62272e07bb0142;
  for (final c in callId.codeUnits) {
    a = (a ^ c) * 0x100000001b3;
    b = (b ^ c) * 0x100000001b3 + 0x9e3779b97f4a7c15;
  }
  final bytes = [for (var i = 0; i < 8; i++) (a >> (i * 8)) & 0xff, for (var i = 0; i < 8; i++) (b >> (i * 8)) & 0xff];
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  final h = bytes.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

/// Native call → aapla call id.
String _callIdOf(CallKitParams p) {
  final id = p.extra?['callId'];
  return id is String && id.isNotEmpty ? id : p.id;
}

/// Native call band (ring / ongoing) — call id varun.
Future<void> endNativeCall(String callId) => FlutterCallkitIncoming.endCall(callkitId(callId)).catchError((Object _) {});

class CallSession extends ChangeNotifier {
  CallSession._(this._repo, this.me, {required this.peerUid, required this.peerName, required this.type, required this.outgoing, required this.phase, this.callId});

  final CallRepository _repo;
  final String me;
  final String peerUid;
  final String peerName;
  final CallType type;
  final bool outgoing;

  CallPhase phase;
  String? callId;
  DateTime? connectedAt;
  bool muted = false;
  bool cameraOff = false;
  bool speaker = false;
  bool frontCamera = true;
  String? outcome;
  CallError? error;
  int duration = 0;

  final localRenderer = RTCVideoRenderer();
  final remoteRenderer = RTCVideoRenderer();
  bool remoteVideo = false;

  MediaStream? _local;
  RTCPeerConnection? _pc;
  final _subs = <StreamSubscription<Object?>>[];
  final _timers = <Timer>[];
  Timer? _beat;
  Timer? _reconnect;
  final _pendingLocal = <Map<String, dynamic>>[];
  final _pendingRemote = <Map<String, dynamic>>[];
  bool _remoteSet = false;
  bool _closed = false;
  bool _markedConnected = false;
  CallRecord? _record;

  // Connection tapshil — call jodla nahi tar server logs madhe (web sarkha).
  final _diag = <String, dynamic>{'platform': 'app', 'local': <String, int>{}, 'remote': <String, int>{}, 'ice': 'new', 'conn': 'new', 'turn': false};
  void _bump(String side, String? candidate) {
    final typ = RegExp(r' typ (\w+)').firstMatch(candidate ?? '')?.group(1) ?? '?';
    final m = _diag[side] as Map<String, int>;
    m[typ] = (m[typ] ?? 0) + 1;
  }

  Future<void> _end(String id, String reason) => _repo.end(id, reason, _diag).catchError((Object _) {});

  bool get video => type == CallType.video;
  bool get ended => phase == CallPhase.ended;

  void _set(VoidCallback f) {
    f();
    notifyListeners();
  }

  // ── Outgoing ──

  static CallSession outgoingCall(CallRepository repo, String me, String uid, String name, CallType type) {
    final s = CallSession._(repo, me, peerUid: uid, peerName: name, type: type, outgoing: true, phase: CallPhase.starting);
    unawaited(s._dial());
    return s;
  }

  Future<void> _dial() async {
    try {
      await _initRenderers();
      final results = await Future.wait([_repo.config(), _openMedia()]);
      if (_closed) return;
      final cfg = results[0] as CallConfig;
      final pc = await _makePeer(cfg);
      final offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      if (_closed) return;
      _set(() => phase = CallPhase.calling);
      final r = await _repo.start(peerUid, type, {'type': offer.type, 'sdp': offer.sdp});
      callId = r.callId;
      if (r.busy) return _finish('busy');
      if (_closed) return unawaited(_repo.end(r.callId, 'hangup').catchError((Object _) {}));
      // Android: native outgoing call — foreground service (mic / camera) mule app background madhe
      // gela tari awaaj jato ani Android app marat nahi. (iOS: `audio` background mode purto.)
      if (Platform.isAndroid) unawaited(_startNative(r.callId));
      for (final c in _pendingLocal) {
        unawaited(_repo.sendCandidate(r.callId, me, c).catchError((Object _) {}));
      }
      _pendingLocal.clear();
      _subs.add(_repo.candidates(r.callId, peerUid).listen(_addRemote));
      _subs.add(_repo.watch(r.callId).listen(_onRecord));
      // Uchalla nahi — missed.
      _timers.add(
        Timer(Duration(seconds: cfg.ringSeconds), () {
          if (phase == CallPhase.calling || phase == CallPhase.ringing) {
            unawaited(_end(r.callId, 'timeout'));
            _finish('missed');
          }
        }),
      );
    } catch (e) {
      _fail(e);
    }
  }

  // ── Incoming ──

  static CallSession incomingCall(CallRepository repo, String me, CallRecord r) {
    final s = CallSession._(
      repo,
      me,
      peerUid: r.caller,
      peerName: r.names[r.caller] ?? '',
      type: r.type,
      outgoing: false,
      phase: CallPhase.incoming,
      callId: r.id,
    );
    s._record = r;
    s._subs.add(repo.watch(r.id).listen(s._onRecord));
    return s;
  }

  Future<void> accept() async {
    final id = callId;
    final offer = _record?.offer;
    if (id == null || phase != CallPhase.incoming || offer == null) return;
    _set(() => phase = CallPhase.connecting);
    _watchConnect();
    try {
      await _initRenderers();
      final results = await Future.wait([_repo.config(), _openMedia()]);
      if (_closed) return;
      final pc = await _makePeer(results[0] as CallConfig);
      _subs.add(_repo.candidates(id, peerUid).listen(_addRemote));
      await pc.setRemoteDescription(RTCSessionDescription(offer['sdp'] as String?, offer['type'] as String?));
      _remoteSet = true;
      await _flushRemote();
      final answer = await pc.createAnswer({});
      await pc.setLocalDescription(answer);
      await _repo.answer(id, {'type': answer.type, 'sdp': answer.sdp});
    } catch (e) {
      unawaited(_end(id, 'failed'));
      _fail(e);
    }
  }

  Future<void> decline() async {
    final id = callId;
    if (id != null) await _repo.decline(id).catchError((Object _) {});
    _finish('declined');
  }

  /// Lal button — kuthlyahi avasthet.
  Future<void> hangup() async {
    if (_closed) return;
    if (!outgoing && phase == CallPhase.incoming) return decline();
    final id = callId;
    _finish(connectedAt != null ? 'completed' : (outgoing ? 'cancelled' : 'declined'));
    if (id != null) await _end(id, 'hangup');
  }

  // ── Controls ──

  void toggleMute() {
    muted = !muted;
    for (final t in _local?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
    notifyListeners();
  }

  void toggleCamera() {
    cameraOff = !cameraOff;
    for (final t in _local?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !cameraOff;
    }
    notifyListeners();
  }

  Future<void> switchCamera() async {
    final t = _local?.getVideoTracks().firstOrNull;
    if (t == null) return;
    try {
      frontCamera = await Helper.switchCamera(t);
      notifyListeners();
    } catch (_) {}
  }

  /// Speaker / earpiece (phone var — web la nahi).
  Future<void> toggleSpeaker() async {
    speaker = !speaker;
    await Helper.setSpeakerphoneOn(speaker).catchError((Object _) {});
    notifyListeners();
  }

  // ── Internals ──

  bool _renderersReady = false;
  Future<void> _initRenderers() async {
    if (_renderersReady) return;
    _renderersReady = true;
    await localRenderer.initialize();
    await remoteRenderer.initialize();
  }

  Future<void> _openMedia() async {
    final stream = await navigator.mediaDevices.getUserMedia({
      'audio': {'echoCancellation': true, 'noiseSuppression': true, 'autoGainControl': true},
      'video': video ? {'facingMode': 'user', 'width': 1280, 'height': 720} : false,
    });
    if (_closed) {
      for (final t in stream.getTracks()) {
        await t.stop();
      }
      await stream.dispose();
      return;
    }
    _local = stream;
    localRenderer.srcObject = stream;
    // Video call — speaker var (WhatsApp sarkha); voice — earpiece.
    speaker = video;
    await Helper.setSpeakerphoneOn(speaker).catchError((Object _) {});
    notifyListeners();
  }

  Future<RTCPeerConnection> _makePeer(CallConfig cfg) async {
    final pc = await createPeerConnection({'iceServers': cfg.iceServers, 'sdpSemantics': 'unified-plan'});
    _pc = pc;
    _diag['turn'] = cfg.iceServers.any((s) => '${s['urls']}'.contains('turn'));
    pc.onIceConnectionState = (s) => _diag['ice'] = s.name;
    for (final t in _local?.getTracks() ?? <MediaStreamTrack>[]) {
      await pc.addTrack(t, _local!);
    }
    pc.onTrack = (e) {
      if (e.streams.isEmpty) return;
      remoteRenderer.srcObject = e.streams.first;
      if (e.track.kind == 'video') remoteVideo = true;
      notifyListeners();
    };
    pc.onIceCandidate = (c) {
      if (c.candidate == null) return;
      _bump('local', c.candidate);
      final m = {'candidate': c.candidate, 'sdpMid': c.sdpMid, 'sdpMLineIndex': c.sdpMLineIndex};
      final id = callId;
      // Call id milalyavar thet; tyaadhi (caller — `start` chya adhi) ranget.
      if (id != null) {
        unawaited(_repo.sendCandidate(id, me, m).catchError((Object _) {}));
      } else {
        _pendingLocal.add(m);
      }
    };
    pc.onConnectionState = _onConnection;
    return pc;
  }

  void _onConnection(RTCPeerConnectionState s) {
    _diag['conn'] = s.name;
    if (_closed) return;
    if (s == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
      _reconnect?.cancel();
      _reconnect = null;
      _set(() {
        phase = CallPhase.connected;
        connectedAt ??= DateTime.now();
      });
      final id = callId;
      if (id != null && !_markedConnected) {
        _markedConnected = true;
        unawaited(_repo.connected(id).catchError((Object _) {}));
        unawaited(FlutterCallkitIncoming.setCallConnected(callkitId(id)).catchError((Object _) {}));
        _beat = Timer.periodic(const Duration(seconds: 30), (_) => unawaited(_repo.heartbeat(id).catchError((Object _) {})));
      }
    } else if (s == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected && connectedAt != null) {
      // Network badalla — WebRTC swatah parat jodto; 15 s madhe nahi tar samplava.
      _set(() => phase = CallPhase.reconnecting);
      _reconnect ??= Timer(const Duration(seconds: 15), _lost);
    } else if (s == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
      _lost();
    }
  }

  /// Uchallyanantar media jodla nahi (ICE "checking" madhech — kahi phones var "failed" yetach
  /// nahi) tar "Connecting…" kayam nako: 30 s nantar network error ne samplava.
  void _watchConnect() {
    _timers.add(
      Timer(const Duration(seconds: 30), () {
        if (!_closed && connectedAt == null) _lost();
      }),
    );
  }

  Future<void> _startNative(String id) async {
    try {
      await FlutterCallkitIncoming.startCall(
        CallKitParams(
          id: callkitId(id),
          nameCaller: peerName,
          appName: 'MultiSarv',
          handle: video ? 'Video call' : 'Voice call',
          type: video ? 1 : 0,
          extra: {'callId': id},
          android: const AndroidParams(isCustomNotification: true, isShowLogo: false, backgroundColor: '#0B0D12', actionColor: '#00A884', textColor: '#ffffff'),
        ),
      );
    } catch (_) {}
  }

  void _lost() {
    final id = callId;
    final was = connectedAt != null;
    _finish(was ? 'completed' : 'failed', was ? null : CallError.network);
    if (id != null) unawaited(_end(id, was ? 'hangup' : 'failed'));
  }

  Future<void> _onRecord(CallRecord? r) async {
    if (_closed) return;
    if (r == null) return _finish(outcome ?? 'failed');
    _record = r;
    if (r.status == 'ended') return _finish(r.outcome ?? 'completed', null, r.duration);
    if (!outgoing) return;
    if (r.status == 'ringing' && phase == CallPhase.calling) _set(() => phase = CallPhase.ringing);
    final answer = r.answer;
    if ((r.status == 'accepted' || r.status == 'connected') && answer != null && !_remoteSet && _pc != null) {
      if (connectedAt == null) {
        _set(() => phase = CallPhase.connecting);
        _watchConnect();
      }
      try {
        await _pc!.setRemoteDescription(RTCSessionDescription(answer['sdp'] as String?, answer['type'] as String?));
        _remoteSet = true;
        await _flushRemote();
      } catch (e) {
        _fail(e);
      }
    }
  }

  void _addRemote(Map<String, dynamic> c) {
    _bump('remote', c['candidate'] as String?);
    if (_pc == null || !_remoteSet) return _pendingRemote.add(c);
    unawaited(_pc!.addCandidate(_ice(c)).catchError((Object _) {}));
  }

  Future<void> _flushRemote() async {
    for (final c in List.of(_pendingRemote)) {
      await _pc?.addCandidate(_ice(c)).catchError((Object _) {});
    }
    _pendingRemote.clear();
  }

  static RTCIceCandidate _ice(Map<String, dynamic> c) =>
      RTCIceCandidate(c['candidate'] as String?, c['sdpMid'] as String?, (c['sdpMLineIndex'] as num?)?.toInt());

  void _fail(Object e) {
    _diag['error'] = '$e'.length > 200 ? '$e'.substring(0, 200) : '$e';
    final s = '$e'.toLowerCase();
    final err = s.contains('permission') || s.contains('notallowed') || s.contains('denied')
        ? CallError.permission
        : s.contains('notfound') || s.contains('no camera') || s.contains('device')
        ? CallError.noDevice
        : CallError.server;
    final id = callId;
    _finish('failed', err);
    if (id != null) unawaited(_end(id, 'failed'));
  }

  /// Sagle sodun — camera / mic band, connection band, native call UI band.
  void _finish(String result, [CallError? err, int? secs]) {
    if (_closed) return;
    _closed = true;
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    for (final t in _timers) {
      t.cancel();
    }
    _beat?.cancel();
    _reconnect?.cancel();
    for (final t in _local?.getTracks() ?? <MediaStreamTrack>[]) {
      unawaited(t.stop());
    }
    unawaited(_local?.dispose());
    _local = null;
    unawaited(_pc?.close());
    _pc = null;
    final id = callId;
    if (id != null) unawaited(endNativeCall(id));
    _set(() {
      phase = CallPhase.ended;
      outcome = result;
      error = err ?? error;
      duration = secs ?? (connectedAt == null ? 0 : DateTime.now().difference(connectedAt!).inSeconds);
    });
  }

  @override
  void dispose() {
    if (!_closed) unawaited(hangup());
    if (_renderersReady) {
      localRenderer.srcObject = null;
      remoteRenderer.srcObject = null;
      unawaited(localRenderer.dispose());
      unawaited(remoteRenderer.dispose());
    }
    super.dispose();
  }
}

/// Ekach vel ekach call. Incoming aikto, native ring dakhavto, Accept / Decline handle karto.
class CallService extends ChangeNotifier {
  final _repo = CallRepository();
  CallSession? current;
  String? _me;
  StreamSubscription<List<CallRecord>>? _incomingSub;
  StreamSubscription<CallEvent?>? _eventSub;
  final _shown = <String>{};
  final _accepting = <String>{};
  Set<String> _ringing = {};
  AppLifecycleListener? _life;

  static const _native = MethodChannel('multisarv/calls');

  bool get inCall => current != null && !current!.ended;

  /// Login nantar — incoming calls aika, native call screen che events, app band astana accept kelela call.
  void start(String me) {
    if (_me == me) return;
    stop();
    _me = me;
    _incomingSub = _repo.incoming(me).listen(_onIncoming, onError: (Object _) {});
    _eventSub = FlutterCallkitIncoming.onEvent.listen(_onEvent);
    _life = AppLifecycleListener(onResume: () => unawaited(_cleanup()));
    unawaited(_resumeAccepted().then((_) => _cleanup()));
  }

  void stop() {
    unawaited(_incomingSub?.cancel());
    unawaited(_eventSub?.cancel());
    _life?.dispose();
    _incomingSub = null;
    _eventSub = null;
    _life = null;
    _me = null;
  }

  /// Call nahi tari phone var "call chalu ahe" notification atakla — accepted callkit
  /// entries samplava, ani (Android) ongoing service / notification thet band.
  Future<void> _cleanup() async {
    if (inCall || _accepting.isNotEmpty) return;
    try {
      for (final c in await FlutterCallkitIncoming.activeCalls()) {
        if (c.isAccepted) await FlutterCallkitIncoming.endCall(c.id);
      }
    } catch (_) {}
    if (Platform.isAndroid && !inCall && _accepting.isEmpty) {
      await _native.invokeMethod<void>('clearOngoing').catchError((Object _) {});
    }
  }

  /// Chat header madhun.
  String? startCall(String uid, String name, CallType type) {
    final me = _me;
    if (me == null) return 'Please sign in again.';
    if (inCall) return "You're already on a call.";
    _open(CallSession.outgoingCall(_repo, me, uid, name, type));
    return null;
  }

  void _open(CallSession s) {
    current = s;
    notifyListeners();
    s.addListener(() {
      if (s.ended) {
        Future.delayed(const Duration(milliseconds: 2200), () {
          if (current == s) {
            current = null;
            notifyListeners();
            unawaited(_cleanup());
          }
        });
      }
    });
    navigatorKey.currentState?.push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => CallView(session: s)));
  }

  void _onIncoming(List<CallRecord> list) {
    final now = DateTime.now();
    final ids = list.map((r) => r.id).toSet();
    // Caller ne cancel kela / dusrikade uchalla — ring thambva.
    for (final gone in _ringing.difference(ids)) {
      if (current?.callId != gone) unawaited(endNativeCall(gone));
    }
    _ringing = ids;
    for (final r in list) {
      if (_shown.contains(r.id)) continue;
      _shown.add(r.id);
      if (r.createdAt != null && now.difference(r.createdAt!).inSeconds > 60) continue;
      if (inCall) continue;
      unawaited(showIncoming(r.id, r.names[r.caller] ?? 'MultiSarv', r.type == CallType.video));
    }
  }

  Future<void> _onEvent(CallEvent? e) async {
    switch (e) {
      case CallEventActionCallAccept(:final callKitParams):
        await acceptById(_callIdOf(callKitParams));
      case CallEventActionCallDecline(:final callKitParams):
        await _repo.decline(_callIdOf(callKitParams)).catchError((Object _) {});
      // Phone cha native "End" (iOS lock screen / Android ongoing notification) — app cha call pan band.
      // Aaplach `endNativeCall` ne aala tar call adhich sampla ahe (hangup kahi karat nahi).
      case CallEventActionCallEnded(:final callKitParams):
        final s = current;
        if (s != null && !s.ended && s.callId == _callIdOf(callKitParams)) await s.hangup();
      default:
        break;
    }
  }

  /// App band astana native screen var "Accept" — app ughdlyavar to call joda.
  Future<void> _resumeAccepted() async {
    try {
      final active = await FlutterCallkitIncoming.activeCalls();
      for (final c in active) {
        if (c.isAccepted && current?.callId != _callIdOf(c)) await acceptById(_callIdOf(c));
      }
    } catch (_) {}
  }

  Future<void> acceptById(String callId) async {
    final me = _me;
    // Native "Accept" event ani `_resumeAccepted` dogha ekach call la — ekdach joda.
    if (me == null || _accepting.contains(callId) || (current?.callId == callId && !current!.ended)) return;
    _accepting.add(callId);
    try {
      final r = await _repo.get(callId).catchError((Object _) => null);
      if (r == null || r.status != 'ringing' || r.callee != me) {
        await endNativeCall(callId);
        return;
      }
      if (inCall) {
        await endNativeCall(callId);
        return;
      }
      final s = CallSession.incomingCall(_repo, me, r);
      _open(s);
      await s.accept();
    } finally {
      _accepting.remove(callId);
      if (!inCall) unawaited(_cleanup());
    }
  }
}

/// Native incoming call screen (ring) — app ughda / background / band (background push handler).
/// Ekach call dusryanda nahi (adhich dakhavla asel tar).
Future<void> showIncoming(String callId, String name, bool video) async {
  try {
    final active = await FlutterCallkitIncoming.activeCalls();
    if (active.any((c) => _callIdOf(c) == callId)) return;
    await FlutterCallkitIncoming.showCallkitIncoming(
      CallKitParams(
        id: callkitId(callId),
        nameCaller: name,
        appName: 'MultiSarv',
        handle: video ? 'Video call' : 'Voice call',
        type: video ? 1 : 0,
        duration: 45000,
        extra: {'callId': callId},
        // Missed call notification server pathavto — duplicate nako.
        missedCallNotification: const NotificationParams(showNotification: false),
        android: const AndroidParams(
          isCustomNotification: true,
          isShowLogo: false,
          ringtonePath: 'system_ringtone_default',
          backgroundColor: '#0B0D12',
          actionColor: '#00A884',
          textColor: '#ffffff',
          incomingCallNotificationChannelName: 'Incoming calls',
          isShowFullLockedScreen: true,
          textAccept: 'Accept',
          textDecline: 'Decline',
        ),
        ios: IOSParams(handleType: 'generic', supportsVideo: video, audioSessionMode: video ? 'videoChat' : 'voiceChat', includesCallsInRecents: false),
      ),
    );
  } catch (_) {}
}
