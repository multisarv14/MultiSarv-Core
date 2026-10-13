import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../core/backend.dart';
import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../data/chat_repository.dart';
import '../../data/models.dart';
import '../../data/project_repository.dart';
import '../../data/ticket_repository.dart';
import '../../services/session_service.dart';
import '../tickets/ticket_detail_view.dart';
import '../tickets/tickets_view.dart';

/// Dashboard — swagat, majhe tickets / chats / projects chi sankhya, ani mala assign zalele khule tickets.
class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> with AutomaticKeepAliveClientMixin {
  final Me _me = locator<SessionService>().me;
  final _subs = <StreamSubscription<Object?>>[];

  final Map<TicketKind, List<Ticket>> _tickets = {};

  /// Tickets load zale nahit — 0 dakhavnyaaivaji karan.
  String? _ticketError;
  List<ChatSummary>? _chats;
  int? _projects;
  String _company = '';

  late final List<TicketKind> _kinds = TicketKind.values.where((k) => _me.can(k.module, 'view')).toList();

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    final tickets = locator<TicketRepository>();
    for (final k in _kinds) {
      _subs.add(
        tickets.tickets(k, superAdmin: _me.superAdmin).listen(
          (t) => _set(() {
            _tickets[k] = t;
            _ticketError = null;
          }),
          onError: (Object e) => _set(() => _ticketError = errorText(e)),
        ),
      );
    }
    _subs.add(locator<ChatRepository>().myChats(_me.uid).listen((c) => _set(() => _chats = c), onError: (Object _) {}));
    _subs.add(
      locator<ProjectRepository>().all().listen(
        (p) => _set(() => _projects = p.where((x) => _me.superAdmin || _me.projects.contains(x.id)).length),
        onError: (Object _) {},
      ),
    );
    FirebaseFirestore.instance.collection('settings').doc('company').get().then((d) {
      _set(() => _company = '${d.data()?['name'] ?? ''}');
    }, onError: (Object _) {});
  }

  void _set(VoidCallback f) {
    if (mounted) setState(f);
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  bool get _ticketsLoaded => _kinds.every(_tickets.containsKey);
  Iterable<Ticket> get _all => _tickets.values.expand((t) => t);
  Iterable<Ticket> get _active => _all.where((t) => t.status != TicketStatus.closed);

  List<Ticket> get _mine {
    final list = _active.where((t) => t.assignedTo?.uid == _me.uid).toList();
    // Gambhir pahile, mag navin.
    list.sort((a, b) {
      final p = b.priority.rank.compareTo(a.priority.rank);
      return p != 0 ? p : (b.updatedAt ?? DateTime(0)).compareTo(a.updatedAt ?? DateTime(0));
    });
    return list;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final first = (_me.name.isNotEmpty ? _me.name : _me.email).split(RegExp(r'[\s@]')).first;
    final mine = _mine;
    final raised = _active.where((t) => t.raisedBy?.uid == _me.uid).length;
    final unread = _chats?.where((c) => c.unread).length;
    final hour = DateTime.now().hour;
    final hello = hour < 12 ? 'Good morning' : (hour < 17 ? 'Good afternoon' : 'Good evening');

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Wa.bg(context),
        titleSpacing: 16,
        title: const Row(
          children: [
            Logo(size: 28),
            SizedBox(width: 10),
            Text('Dashboard', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 22, letterSpacing: -.5)),
          ],
        ),
        actions: const [ThemeToggle(), SizedBox(width: 8)],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Rise(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$hello, $first 👋', style: TextStyle(color: Wa.muted(context), fontSize: 14)),
                const SizedBox(height: 2),
                Text(
                  _company.isNotEmpty ? _company : 'MultiSarv',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -.6, color: Wa.text(context)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10,
            crossAxisSpacing: 10,
            childAspectRatio: 1.55,
            children: [
              _Stat(
                index: 1,
                icon: Icons.assignment_ind_rounded,
                color: Wa.accent,
                label: 'Assigned to me',
                value: _kinds.isEmpty || (_ticketError != null && !_ticketsLoaded) ? '—' : (_ticketsLoaded ? '${mine.length}' : null),
                onTap: () => homeTab.value = 1,
              ),
              _Stat(
                index: 2,
                icon: Icons.outbox_rounded,
                color: const Color(0xFFF59E0B),
                label: 'Raised by me',
                value: _kinds.isEmpty || (_ticketError != null && !_ticketsLoaded) ? '—' : (_ticketsLoaded ? '$raised' : null),
                onTap: () => homeTab.value = 1,
              ),
              _Stat(
                index: 3,
                icon: Icons.mark_chat_unread_rounded,
                color: const Color(0xFF10B981),
                label: 'Unread chats',
                value: unread?.toString(),
                onTap: () => homeTab.value = 0,
              ),
              _Stat(
                index: 4,
                icon: Icons.folder_copy_rounded,
                color: const Color(0xFF0EA5E9),
                label: 'Projects',
                value: _projects?.toString(),
                onTap: () => homeTab.value = 2,
              ),
            ],
          ),
          if (_ticketError != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.error_outline_rounded, size: 18, color: Theme.of(context).colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text("Couldn't load tickets: $_ticketError", style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.error)),
                ),
              ],
            ),
          ],
          if (_kinds.isNotEmpty && _ticketsLoaded) ...[
            const SizedBox(height: 20),
            _StatusBar(tickets: _all.where((t) => t.assignedTo?.uid == _me.uid).toList()),
            const SizedBox(height: 20),
            Row(
              children: [
                Text(
                  'My open tickets',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Wa.text(context)),
                ),
                const Spacer(),
                TextButton(onPressed: () => homeTab.value = 1, child: const Text('View all')),
              ],
            ),
            if (mine.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Wa.surface(context),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Wa.border(context)),
                ),
                child: Column(
                  children: [
                    const Icon(Icons.celebration_rounded, color: Wa.accent, size: 32),
                    const SizedBox(height: 8),
                    Text('Nothing assigned to you right now.', style: TextStyle(color: Wa.muted(context))),
                  ],
                ),
              )
            else
              for (final t in mine.take(5))
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 0),
                  child: TicketTile(
                    ticket: t,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailView(id: t.id))),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.index, required this.icon, required this.color, required this.label, required this.value, required this.onTap});
  final int index;
  final IconData icon;
  final Color color;
  final String label;

  /// null = load hotay.
  final String? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Rise(
    index: index,
    child: Pressable(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Wa.surface(context),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Wa.border(context)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(color: color.withValues(alpha: .13), borderRadius: BorderRadius.circular(10)),
              child: Icon(icon, size: 18, color: color),
            ),
            const Spacer(),
            value == null
                ? const Shimmer(child: Bone(width: 36, height: 22))
                : Text(
                    value!,
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -.5, color: Wa.text(context)),
                  ),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: Wa.muted(context)),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Mala assign zalele tickets — status nusar ek rangit patti.
class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.tickets});
  final List<Ticket> tickets;

  @override
  Widget build(BuildContext context) {
    final counts = {for (final s in TicketStatus.values) s: tickets.where((t) => t.status == s).length};
    final total = tickets.length;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Wa.border(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'My tickets by status',
            style: TextStyle(fontWeight: FontWeight.w700, color: Wa.text(context)),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 10,
              child: total == 0
                  ? ColoredBox(color: Wa.surface2(context), child: const SizedBox.expand())
                  : Row(
                      children: [
                        for (final s in TicketStatus.values)
                          if (counts[s]! > 0)
                            Expanded(
                              flex: counts[s]!,
                              child: ColoredBox(color: s.color),
                            ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final s in TicketStatus.values)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.circle, size: 9, color: s.color),
                    const SizedBox(width: 5),
                    Text('${s.label} ${counts[s]}', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
