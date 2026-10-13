import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/ticket_repository.dart';
import '../../services/session_service.dart';
import '../conversation/widgets/avatar.dart';
import 'raise_ticket_view.dart';
import 'ticket_detail_view.dart';

/// Tickets tab — var Dev Tickets / Client Tickets don sections (web `/dev-tickets`, `/client-tickets`).
/// Module cha "view" asel tarach to section disto.
class TicketsView extends StatelessWidget {
  const TicketsView({super.key});

  @override
  Widget build(BuildContext context) {
    final me = locator<SessionService>().me;
    final kinds = TicketKind.values.where((k) => me.can(k.module, 'view')).toList();
    final appBar = AppBar(
      automaticallyImplyLeading: false,
      backgroundColor: Wa.bg(context),
      titleSpacing: 16,
      title: const Text('Tickets', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 24, letterSpacing: -.6)),
      actions: const [ThemeToggle(), SizedBox(width: 8)],
      bottom: kinds.isEmpty
          ? null
          : TabBar(
              labelColor: Wa.accent,
              indicatorColor: Wa.accent,
              unselectedLabelColor: Wa.muted(context),
              labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5),
              dividerColor: Wa.border(context),
              tabs: [
                for (final k in kinds)
                  Tab(
                    icon: Icon(k == TicketKind.dev ? Icons.build_circle_outlined : Icons.support_agent_rounded, size: 20),
                    iconMargin: const EdgeInsets.only(bottom: 2),
                    text: k.label,
                  ),
              ],
            ),
    );
    if (kinds.isEmpty) {
      return Scaffold(
        appBar: appBar,
        body: const _Empty(
          icon: Icons.lock_outline_rounded,
          title: 'No ticket access',
          body: 'Ask the super admin to give you Dev or Client Tickets access (Settings → Module Access).',
        ),
      );
    }
    return DefaultTabController(
      length: kinds.length,
      child: Scaffold(
        appBar: appBar,
        body: TabBarView(children: [for (final k in kinds) TicketList(kind: k)]),
      ),
    );
  }
}

/// Ekach prakarache tickets — "Assigned to me" (default), status, search.
class TicketList extends StatefulWidget {
  const TicketList({super.key, required this.kind});
  final TicketKind kind;

  @override
  State<TicketList> createState() => _TicketListState();
}

class _TicketListState extends State<TicketList> with AutomaticKeepAliveClientMixin {
  final _repo = locator<TicketRepository>();
  final Me _me = locator<SessionService>().me;

  TicketKind get _kind => widget.kind;

  @override
  bool get wantKeepAlive => true;
  StreamSubscription<List<Ticket>>? _sub;
  List<Ticket>? _tickets;
  String? _error;
  Map<String, String> _projects = const {};

  /// Web sarkha — adhi sagle (access asnare) tickets; "Assigned to me" chip ne fakt majhe.
  bool _mine = false;
  TicketStatus? _status;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _listen();
    _repo.projects().then((p) {
      if (mounted) setState(() => _projects = {for (final x in p) x.id: x.name});
    });
  }

  void _listen() {
    _sub?.cancel();
    setState(() {
      _tickets = null;
      _error = null;
    });
    _sub = _repo
        .tickets(_kind, superAdmin: _me.superAdmin)
        .listen(
          (t) {
            if (!mounted) return;
            setState(() {
              _tickets = t;
              _error = null;
            });
          },
          onError: (Object e) {
            if (mounted) setState(() => _error = errorText(e));
          },
        );
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  List<Ticket> get _visible {
    final q = _query.trim().toLowerCase();
    return (_tickets ?? const <Ticket>[])
        .where((t) => !_mine || t.assignedTo?.uid == _me.uid)
        .where((t) => _status == null ? t.status != TicketStatus.closed : t.status == _status)
        .where((t) => q.isEmpty || t.id.toLowerCase().contains(q) || t.title.toLowerCase().contains(q))
        .toList();
  }

  int _count(TicketStatus? s) => (_tickets ?? const <Ticket>[])
      .where((t) => !_mine || t.assignedTo?.uid == _me.uid)
      .where((t) => s == null ? t.status != TicketStatus.closed : t.status == s)
      .length;

  void _open(String id) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailView(id: id)));

  Future<void> _raise() async {
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => RaiseTicketView(kind: _kind)));
    if (id != null && mounted) _open(id);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final list = _visible;
    final canRaise = _me.can(_kind.module, 'raise');
    return Scaffold(
      floatingActionButton: canRaise
          ? FloatingActionButton.extended(
              onPressed: _raise,
              backgroundColor: Wa.accent,
              foregroundColor: Wa.accentFg,
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Raise ticket', style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
      body: RefreshIndicator(
        onRefresh: () async => _kind == TicketKind.dev && !_me.superAdmin ? _repo.refresh() : _listen(),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  decoration: const InputDecoration(hintText: 'Search ID or title', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                child: Row(
                  children: [
                    _Chip(label: 'Assigned to me', selected: _mine, onTap: () => setState(() => _mine = !_mine), icon: Icons.person_rounded),
                    const SizedBox(width: 12),
                    _Chip(label: 'Active  ${_count(null)}', selected: _status == null, onTap: () => setState(() => _status = null)),
                    for (final s in TicketStatus.values) ...[
                      const SizedBox(width: 8),
                      _Chip(label: '${s.label}  ${_count(s)}', selected: _status == s, onTap: () => setState(() => _status = s), color: s.color),
                    ],
                  ],
                ),
              ),
            ),
            if (_error != null && _tickets == null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _Empty(icon: Icons.error_outline_rounded, title: "Couldn't load tickets", body: _error!),
              )
            else if (_tickets == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (list.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _Empty(
                  icon: Icons.confirmation_number_outlined,
                  title: 'No tickets',
                  body: _mine ? 'Nothing assigned to you here. Turn off "Assigned to me" to see all.' : 'No tickets match these filters.',
                ),
              )
            else
              SliverList.builder(
                itemCount: list.length,
                itemBuilder: (context, i) => Rise(
                  key: ValueKey(list[i].id),
                  index: i,
                  child: TicketTile(ticket: list[i], project: _projects[list[i].projectId], onTap: () => _open(list[i].id)),
                ),
              ),
            const SliverToBoxAdapter(child: SafeArea(top: false, child: SizedBox(height: 88))),
          ],
        ),
      ),
    );
  }
}

class TicketTile extends StatelessWidget {
  const TicketTile({super.key, required this.ticket, required this.onTap, this.project});
  final Ticket ticket;
  final String? project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = ticket;
    final muted = Wa.muted(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: Material(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Wa.border(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      t.id,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: muted, fontFeatures: const [FontFeature.tabularFigures()]),
                    ),
                    if (project != null) ...[
                      Text('  ·  ', style: TextStyle(color: muted, fontSize: 12)),
                      Flexible(
                        child: Text(
                          project!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                      ),
                    ],
                    const Spacer(),
                    StatusPill(t.status),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  t.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Wa.text(context), height: 1.3),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    PriorityTag(t.priority),
                    const Spacer(),
                    if (t.assignedTo != null) ...[
                      Avatar(name: t.assignedTo!.label, seed: t.assignedTo!.uid, radius: 10),
                      const SizedBox(width: 6),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 140),
                        child: Text(
                          t.assignedTo!.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: muted),
                        ),
                      ),
                    ] else
                      Text(
                        'Unassigned',
                        style: TextStyle(fontSize: 12, color: muted, fontStyle: FontStyle.italic),
                      ),
                    if (t.createdAt != null) ...[
                      const SizedBox(width: 10),
                      Text(DateFormat('dd MMM').format(t.createdAt!), style: TextStyle(fontSize: 12, color: muted)),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final TicketStatus status;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
    decoration: BoxDecoration(color: status.color.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
    child: Text(
      status.label,
      style: TextStyle(color: status.color, fontSize: 11.5, fontWeight: FontWeight.w700),
    ),
  );
}

class PriorityTag extends StatelessWidget {
  const PriorityTag(this.priority, {super.key});
  final TicketPriority priority;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.flag_rounded, size: 14, color: priority.color),
      const SizedBox(width: 4),
      Text(
        priority.label,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: priority.color),
      ),
    ],
  );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap, this.color, this.icon});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Wa.accent;
    return Pressable(
      onTap: onTap,
      scale: .94,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: easeOutSoft,
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? c : Wa.surface(context),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? c : Wa.border(context)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 15, color: selected ? Colors.white : Wa.muted(context)), const SizedBox(width: 5)],
            Text(
              label,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Colors.white : Wa.muted(context)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(32, 48, 32, 48),
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 40, color: Wa.accent),
        const SizedBox(height: 14),
        Text(
          title,
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Wa.text(context)),
        ),
        const SizedBox(height: 6),
        Text(
          body,
          textAlign: TextAlign.center,
          style: TextStyle(color: Wa.muted(context), height: 1.4),
        ),
      ],
    ),
  );
}
