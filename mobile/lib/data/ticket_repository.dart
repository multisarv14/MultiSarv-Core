import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../core/backend.dart';

/// Core `tickets` — Client (CLT-…) ani Dev (DEV-…). Web `src/api/tickets.ts` sobat same shape.
/// Vachne Firestore (rules), lihne core functions (`core/functions/src/tickets.ts`).

enum TicketKind {
  dev('devTickets', 'Dev Tickets'),
  client('clientTickets', 'Client Tickets');

  const TicketKind(this.module, this.label);
  final String module;
  final String label;

  static TicketKind of(Object? v) => v == 'client' ? client : dev;
}

/// Open → In Process → UAT → Closed; UAT → In Process (fail); In Process / UAT ⇄ Hold (server pan hech tapasto).
enum TicketStatus {
  open('Open', Color(0xFF0EA5E9)),
  inProcess('In Process', Color(0xFF6366F1)),
  uat('UAT', Color(0xFFF59E0B)),
  closed('Closed', Color(0xFF10B981)),
  hold('Hold', Color(0xFF94A3B8));

  const TicketStatus(this.label, this.color);
  final String label;
  final Color color;

  static TicketStatus of(Object? v) => values.where((s) => s.name == v).firstOrNull ?? open;

  List<TicketStatus> get next => switch (this) {
    open => const [inProcess],
    inProcess => const [uat, hold],
    uat => const [inProcess, closed, hold],
    closed => const [],
    hold => const [inProcess],
  };
}

/// Dropdown kram (server `PRIORITIES` sobat same). Juna ticket = medium.
enum TicketPriority {
  medium('Medium', Color(0xFF0EA5E9), 1),
  low('Low', Color(0xFF94A3B8), 0),
  high('High', Color(0xFFF59E0B), 2),
  critical('Critical', Color(0xFFF43F5E), 3),
  showstopper('Showstopper', Color(0xFFBE123C), 4);

  const TicketPriority(this.label, this.color, this.rank);
  final String label;
  final Color color;
  final int rank;

  static TicketPriority of(Object? v) => values.where((p) => p.name == v).firstOrNull ?? medium;
}

class Person {
  const Person({required this.uid, required this.name, required this.email});

  static Person? of(Object? v) {
    if (v is! Map) return null;
    return Person(uid: '${v['uid'] ?? ''}', name: '${v['name'] ?? ''}', email: '${v['email'] ?? ''}');
  }

  final String uid;
  final String name;
  final String email;

  String get label => name.isNotEmpty ? name : email;
}

/// Firestore Timestamp kinva `listDevTickets` che millis.
DateTime? _when(Object? v) => v is Timestamp ? v.toDate() : (v is num ? DateTime.fromMillisecondsSinceEpoch(v.toInt()) : null);

class Ticket {
  const Ticket({
    required this.id,
    required this.kind,
    required this.title,
    required this.description,
    required this.projectId,
    required this.priority,
    required this.module,
    required this.status,
    required this.raisedBy,
    required this.assignedTo,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Ticket.fromMap(String id, Map<Object?, Object?> d) => Ticket(
    id: id,
    kind: TicketKind.of(d['kind']),
    title: '${d['title'] ?? ''}',
    description: '${d['description'] ?? ''}',
    projectId: '${d['projectId'] ?? ''}',
    priority: TicketPriority.of(d['priority']),
    module: d['module'] is String && (d['module'] as String).isNotEmpty ? d['module'] as String : null,
    status: TicketStatus.of(d['status']),
    raisedBy: Person.of(d['raisedBy']),
    assignedTo: Person.of(d['assignedTo']),
    createdAt: _when(d['createdAt']),
    updatedAt: _when(d['updatedAt']),
  );

  final String id;
  final TicketKind kind;
  final String title;
  final String description;
  final String projectId;
  final TicketPriority priority;
  final String? module;
  final TicketStatus status;
  final Person? raisedBy;
  final Person? assignedTo;
  final DateTime? createdAt;
  final DateTime? updatedAt;
}

class TicketComment {
  const TicketComment({required this.id, required this.type, this.text, this.from, this.to, this.by, this.at});

  factory TicketComment.fromDoc(DocumentSnapshot<Map<String, dynamic>> d) {
    final x = d.data() ?? const {};
    return TicketComment(
      id: d.id,
      type: '${x['type'] ?? 'comment'}',
      text: x['text'] as String?,
      from: x['from'] as String?,
      to: x['to'] as String?,
      by: Person.of(x['by']),
      at: _when(x['at']),
    );
  }

  /// created / comment / status / assign / edit.
  final String type;
  final String id;
  final String? text;
  final String? from;
  final String? to;
  final Person? by;
  final DateTime? at;
}

/// "Multisarv" (master panel) — Firebase project nahi, tickets sathi.
const multisarvId = 'multisarv';

class ProjectOption {
  const ProjectOption(this.id, this.name);
  final String id;
  final String name;
}

class TicketRepository {
  final _db = FirebaseFirestore.instance;

  /// Client Tickets ani super admin: live query. Dev Tickets (non-super): `listDevTickets`
  /// (server scope lavto — rules thet list deny kartat), [refresh] ne / 20s la taje.
  Stream<List<Ticket>> tickets(TicketKind kind, {required bool superAdmin}) {
    if (kind == TicketKind.dev && !superAdmin) {
      late StreamController<List<Ticket>> c;
      Timer? timer;
      Future<void> load() async {
        try {
          // Server thamla tar spinner kayamcha nako — error + pull-to-refresh.
          final rows = await callCore<List<Object?>>('listDevTickets').timeout(
            const Duration(seconds: 30),
            onTimeout: () => throw AppError("Couldn't reach the server. Check your connection and pull down to retry."),
          );
          if (!c.isClosed) c.add(rows.map((r) => Ticket.fromMap('${(r as Map)['id']}', r)).toList());
        } catch (e) {
          if (!c.isClosed) c.addError(e);
        }
      }

      c = StreamController<List<Ticket>>(
        onListen: () {
          load();
          timer = Timer.periodic(const Duration(seconds: 20), (_) => load());
          _reloaders.add(load);
        },
        onCancel: () {
          timer?.cancel();
          _reloaders.remove(load);
          c.close();
        },
      );
      return c.stream;
    }
    final live = _db
        .collection('tickets')
        .where('kind', isEqualTo: kind.name)
        .orderBy('createdAt', descending: true)
        .limit(1000)
        .snapshots()
        .map((s) => s.docs.map((d) => Ticket.fromMap(d.id, d.data())).toList());
    return _firstWithin(live, const Duration(seconds: 25));
  }

  /// Pahila result `wait` madhe ala nahi (offline, cache nahi) tar error — listener chalu rahto,
  /// data ala ki list yete (screen error kadhto).
  Stream<List<Ticket>> _firstWithin(Stream<List<Ticket>> src, Duration wait) {
    late StreamController<List<Ticket>> c;
    StreamSubscription<List<Ticket>>? sub;
    Timer? timer;
    c = StreamController<List<Ticket>>(
      onListen: () {
        timer = Timer(wait, () {
          if (!c.isClosed) c.addError(AppError("Couldn't reach the server. Check your connection and pull down to retry."));
        });
        sub = src.listen(
          (v) {
            timer?.cancel();
            c.add(v);
          },
          onError: (Object e) {
            timer?.cancel();
            c.addError(e);
          },
        );
      },
      onCancel: () async {
        timer?.cancel();
        await sub?.cancel();
        await c.close();
      },
    );
    return c.stream;
  }

  final _reloaders = <Future<void> Function()>{};

  /// Badal zala (raise / assign / status / comment) — server list taji.
  Future<void> refresh() => Future.wait(_reloaders.map((f) => f()));

  Stream<Ticket?> ticket(String id) => _db.collection('tickets').doc(id).snapshots().map((d) => d.exists ? Ticket.fromMap(d.id, d.data()!) : null);

  Stream<List<TicketComment>> comments(String id) =>
      _db.collection('tickets').doc(id).collection('comments').orderBy('at').limit(500).snapshots().map((s) => s.docs.map(TicketComment.fromDoc).toList());

  /// Projects — Multisarv + NOAI (built-in) + core `projects` (naav sathi / raise).
  Future<List<ProjectOption>>? _projects;

  Future<List<ProjectOption>> projects() => _projects ??= _db
      .collection('projects')
      .get()
      .then(
        (s) => [
          const ProjectOption(multisarvId, 'Multisarv'),
          const ProjectOption('noai', 'NOAI'),
          ...s.docs.where((d) => d.id != 'noai').map((d) => ProjectOption(d.id, '${d.data()['name'] ?? d.id}')),
        ],
      )
      .catchError((Object _) {
        _projects = null;
        return const [ProjectOption(multisarvId, 'Multisarv'), ProjectOption('noai', 'NOAI')];
      });

  Future<List<Person>> assignees(TicketKind kind, String projectId) =>
      callCore<List<Object?>>('listTicketAssignees', {'kind': kind.name, 'projectId': projectId}).then((l) => l.map((e) => Person.of(e)!).toList());

  Future<String> raise(
    TicketKind kind, {
    required String title,
    required String description,
    required String projectId,
    required TicketPriority priority,
    String? assignee,
  }) async {
    final r = await callCore<Map<Object?, Object?>>('raiseTicket', {
      'kind': kind.name,
      'title': title,
      'description': description,
      'projectId': projectId,
      'priority': priority.name,
      'assignee': assignee,
    });
    await refresh();
    return '${r['id']}';
  }

  Future<void> assign(String id, String? uid) => callCore<Object?>('assignTicket', {'id': id, 'assignee': uid}).then((_) => refresh());

  Future<void> setStatus(String id, TicketStatus s) => callCore<Object?>('setTicketStatus', {'id': id, 'status': s.name}).then((_) => refresh());

  Future<void> comment(String id, String text) => callCore<Object?>('addTicketComment', {'id': id, 'text': text}).then((_) => refresh());

  void clear() => _projects = null;
}
