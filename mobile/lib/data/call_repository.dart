import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';

import '../core/backend.dart';

/// 1:1 calls signalling — web `src/api/calls.ts` sarkhech: core Firestore (`calls/{id}` +
/// `candidates`) ani core functions (`core/functions/src/calls.ts`). Media WebRTC (`CallService`).

enum CallType { audio, video }

/// Server call doc.
class CallRecord {
  const CallRecord({
    required this.id,
    required this.caller,
    required this.callee,
    required this.names,
    required this.type,
    required this.status,
    required this.outcome,
    required this.offer,
    required this.answer,
    required this.createdAt,
    required this.duration,
  });

  factory CallRecord.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final x = d.data() ?? const {};
    Map<String, dynamic>? sdp(Object? v) => v is Map ? Map<String, dynamic>.from(v) : null;
    return CallRecord(
      id: d.id,
      caller: '${x['caller'] ?? ''}',
      callee: '${x['callee'] ?? ''}',
      names: ((x['names'] as Map?) ?? const {}).map((k, v) => MapEntry('$k', '$v')),
      type: x['type'] == 'video' ? CallType.video : CallType.audio,
      status: '${x['status'] ?? 'ended'}',
      outcome: x['outcome'] as String?,
      offer: sdp(x['offer']),
      answer: sdp(x['answer']),
      createdAt: x['createdAt'] is Timestamp ? (x['createdAt'] as Timestamp).toDate() : null,
      duration: (x['duration'] as num?)?.toInt() ?? 0,
    );
  }

  final String id;
  final String caller;
  final String callee;
  final Map<String, String> names;
  final CallType type;

  /// ringing / accepted / connected / ended.
  final String status;

  /// completed / missed / declined / cancelled / busy / failed.
  final String? outcome;
  final Map<String, dynamic>? offer;
  final Map<String, dynamic>? answer;
  final DateTime? createdAt;
  final int duration;
}

class CallConfig {
  const CallConfig(this.iceServers, this.ringSeconds);
  final List<Map<String, dynamic>> iceServers;
  final int ringSeconds;
}

class CallRepository {
  final _db = FirebaseFirestore.instance;

  Future<CallConfig>? _config;
  DateTime? _configAt;

  /// STUN / TURN (server deto — TURN che secret app madhe nahi). 10 min cache.
  Future<CallConfig> config() {
    if (_config == null || DateTime.now().difference(_configAt!) > const Duration(minutes: 10)) {
      _configAt = DateTime.now();
      _config = callCore<Map<Object?, Object?>>('getCallConfig').then((r) {
        final list = (r['iceServers'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
        return CallConfig(list, (r['ringSeconds'] as num?)?.toInt() ?? 45);
      });
      _config!.catchError((Object _) {
        _config = null;
        return const CallConfig([], 45);
      });
    }
    return _config!;
  }

  Future<({String callId, bool busy})> start(String to, CallType type, Map<String, dynamic> offer) async {
    final r = await callCore<Map<Object?, Object?>>('startCall', {'to': to, 'type': type.name, 'offer': offer});
    return (callId: '${r['callId']}', busy: r['busy'] == true);
  }

  Future<void> answer(String callId, Map<String, dynamic> answer) => callCore<Object?>('answerCall', {'callId': callId, 'answer': answer});
  Future<void> decline(String callId) => callCore<Object?>('declineCall', {'callId': callId});

  /// `reason`: hangup / timeout / failed.
  Future<void> end(String callId, String reason, [Map<String, dynamic>? diag]) =>
      callCore<Object?>('endCall', {'callId': callId, 'reason': reason, 'diag': ?diag});
  Future<void> connected(String callId) => callCore<Object?>('markCallConnected', {'callId': callId});
  Future<void> heartbeat(String callId) => callCore<Object?>('callHeartbeat', {'callId': callId});

  Future<CallRecord?> get(String callId) async {
    final d = await _db.collection('calls').doc(callId).get();
    return d.exists ? CallRecord.fromDoc(d) : null;
  }

  Stream<CallRecord?> watch(String callId) =>
      _db.collection('calls').doc(callId).snapshots().map((d) => d.exists ? CallRecord.fromDoc(d) : null);

  Future<void> sendCandidate(String callId, String from, Map<String, dynamic> c) =>
      _db.collection('calls').doc(callId).collection('candidates').add({'from': from, 'c': c, 'at': FieldValue.serverTimestamp()});

  /// Samorchyache candidates (navin aale tevdhe).
  Stream<Map<String, dynamic>> candidates(String callId, String from) => _db
      .collection('calls')
      .doc(callId)
      .collection('candidates')
      .where('from', isEqualTo: from)
      .snapshots()
      .expand((s) => s.docChanges.where((c) => c.type == DocumentChangeType.added).map((c) => Map<String, dynamic>.from(c.doc.data()!['c'] as Map)));

  /// Mala yenare (ringing) calls live.
  Stream<List<CallRecord>> incoming(String me) => _db
      .collection('calls')
      .where('callee', isEqualTo: me)
      .where('status', isEqualTo: 'ringing')
      .snapshots()
      .map((s) => s.docs.map(CallRecord.fromDoc).toList());
}
