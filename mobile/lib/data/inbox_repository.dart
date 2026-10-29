import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Bell madhli ek notification — Super Admin notice kinva ticket badal (`core/functions/src/tickets.ts`).
class InboxItem {
  const InboxItem({
    required this.id,
    required this.title,
    required this.body,
    required this.byName,
    required this.isRead,
    required this.at,
    required this.ticketId,
  });

  factory InboxItem.fromDoc(QueryDocumentSnapshot<Map<String, dynamic>> d) {
    final x = d.data();
    final ticketId = x['type'] == 'ticket' ? x['ticketId'] : null;
    return InboxItem(
      id: d.id,
      title: '${x['title'] ?? ''}',
      body: '${x['body'] ?? ''}',
      byName: '${x['byName'] ?? ''}',
      isRead: x['isRead'] == true,
      at: x['createdAt'] is Timestamp ? (x['createdAt'] as Timestamp).toDate() : null,
      ticketId: ticketId is String && ticketId.isNotEmpty ? ticketId : null,
    );
  }

  final String id;
  final String title;
  final String body;
  final String byName;
  final bool isRead;
  final DateTime? at;

  /// Ticket notification — tap kela ki ha ticket.
  final String? ticketId;
}

/// Core User cha inbox (`admins/{uid}/inbox`) — web `CoreNotificationBell` sarkhach (shevatche 30).
/// Login asepparyant ekach live listener; bell ani list [items] vachtat.
class InboxRepository {
  final _db = FirebaseFirestore.instance;
  StreamSubscription<QuerySnapshot<Map<String, dynamic>>>? _sub;
  String? _uid;

  /// `null` = ajun ala nahi.
  final items = ValueNotifier<List<InboxItem>?>(null);

  /// Listener tutla (offline / rules) — list error dakhavte, bell shant.
  final error = ValueNotifier<Object?>(null);

  int get unread => items.value?.where((n) => !n.isRead).length ?? 0;

  void start(String uid) {
    if (_uid == uid && _sub != null) return;
    stop();
    _uid = uid;
    _sub = _db.collection('admins').doc(uid).collection('inbox').orderBy('createdAt', descending: true).limit(30).snapshots().listen((s) {
      error.value = null;
      items.value = s.docs.map(InboxItem.fromDoc).toList();
    }, onError: (Object e) => error.value = e);
  }

  /// Logout — dusrya user la juna inbox disu naye.
  void stop() {
    _sub?.cancel();
    _sub = null;
    _uid = null;
    items.value = null;
    error.value = null;
  }

  /// Rules: fakt `isRead: true` (swatahcha inbox).
  Future<void> markRead(String id) async {
    final uid = _uid;
    if (uid == null) return;
    await _db.collection('admins').doc(uid).collection('inbox').doc(id).update({'isRead': true});
  }

  Future<void> markAllRead() async {
    final uid = _uid;
    final ids = items.value?.where((n) => !n.isRead).map((n) => n.id).toList() ?? const [];
    if (uid == null || ids.isEmpty) return;
    final batch = _db.batch();
    for (final id in ids) {
      batch.update(_db.collection('admins').doc(uid).collection('inbox').doc(id), {'isRead': true});
    }
    await batch.commit();
  }
}
