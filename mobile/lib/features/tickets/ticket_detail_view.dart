import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/ticket_repository.dart';
import '../../services/push_service.dart';
import '../../services/session_service.dart';
import '../conversation/widgets/avatar.dart';
import 'tickets_view.dart';

/// Ek ticket (web TicketDetail) — mahiti, status badal, assign, comments / updates.
class TicketDetailView extends StatefulWidget {
  const TicketDetailView({super.key, required this.id});
  final String id;

  @override
  State<TicketDetailView> createState() => _TicketDetailViewState();
}

class _TicketDetailViewState extends State<TicketDetailView> {
  final _repo = locator<TicketRepository>();
  final _push = locator<PushService>();
  final Me _me = locator<SessionService>().me;
  final _comment = TextEditingController();
  final _scroll = ScrollController();

  late final StreamSubscription<Ticket?> _tSub;
  late final StreamSubscription<List<TicketComment>> _cSub;
  Ticket? _t;
  bool _missing = false;
  String? _error;
  List<TicketComment> _comments = const [];
  String? _project;
  bool _busy = false;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _push.openTicketId = widget.id;
    _tSub = _repo
        .ticket(widget.id)
        .listen(
          (t) {
            if (!mounted) return;
            setState(() {
              _t = t;
              _missing = t == null;
            });
            if (t != null && _project == null) {
              _repo.projects().then((p) {
                final name = p.where((x) => x.id == t.projectId).firstOrNull?.name;
                if (mounted) setState(() => _project = name ?? t.projectId);
              });
            }
          },
          onError: (Object e) {
            if (mounted) setState(() => _error = errorText(e));
          },
        );
    _cSub = _repo.comments(widget.id).listen((c) {
      if (mounted) setState(() => _comments = c);
    }, onError: (Object _) {});
  }

  @override
  void dispose() {
    if (_push.openTicketId == widget.id) _push.openTicketId = null;
    _tSub.cancel();
    _cSub.cancel();
    _comment.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() job, [String? done]) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await job();
      if (done != null) messenger.showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeStatus() async {
    final t = _t!;
    final to = await showModalBottomSheet<TicketStatus>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 8),
              child: Text('Move to', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            ),
            for (final s in t.status.next)
              ListTile(
                leading: Icon(Icons.circle, size: 12, color: s.color),
                title: Text(s.label),
                onTap: () => Navigator.pop(ctx, s),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (to != null) await _run(() => _repo.setStatus(t.id, to), 'Moved to ${to.label}');
  }

  Future<void> _assign() async {
    final t = _t!;
    final list = _repo.assignees(t.kind, t.projectId);
    final picked = await showModalBottomSheet<({Person? p})>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .7),
          child: FutureBuilder<List<Person>>(
            future: list,
            builder: (ctx, snap) {
              if (snap.hasError) return Padding(padding: const EdgeInsets.all(24), child: Text(errorText(snap.error!)));
              if (!snap.hasData) {
                return const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              return ListView(
                shrinkWrap: true,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Center(
                      child: Text('Assign to', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    ),
                  ),
                  ListTile(leading: const Icon(Icons.person_off_outlined), title: const Text('Unassigned'), onTap: () => Navigator.pop(ctx, (p: null))),
                  for (final p in snap.data!)
                    ListTile(
                      leading: Avatar(name: p.label, seed: p.uid, radius: 16),
                      title: Text(p.label),
                      subtitle: Text(p.email),
                      trailing: p.uid == t.assignedTo?.uid ? const Icon(Icons.check_rounded, color: Wa.accent) : null,
                      onTap: () => Navigator.pop(ctx, (p: p)),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
    if (picked == null || picked.p?.uid == t.assignedTo?.uid) return;
    await _run(() => _repo.assign(t.id, picked.p?.uid), picked.p == null ? 'Unassigned' : 'Assigned to ${picked.p!.label}');
  }

  Future<void> _send() async {
    final text = _comment.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _repo.comment(widget.id, text);
      _comment.clear();
      await Future<void>.delayed(const Duration(milliseconds: 150));
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _t;
    return Scaffold(
      backgroundColor: Wa.bg(context),
      appBar: AppBar(
        title: Text(widget.id, style: const TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: t == null
          ? Center(
              child: _missing || _error != null
                  ? Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        _error ?? 'Ticket not found.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Wa.muted(context)),
                      ),
                    )
                  : const CircularProgressIndicator(),
            )
          : Column(
              children: [
                if (_busy) const LinearProgressIndicator(minHeight: 2),
                Expanded(
                  child: ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                    children: [
                      Row(
                        children: [
                          StatusPill(t.status),
                          const SizedBox(width: 10),
                          PriorityTag(t.priority),
                          const Spacer(),
                          Text(t.kind.label, style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        t.title,
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -.3, color: Wa.text(context)),
                      ),
                      const SizedBox(height: 10),
                      SelectableText(t.description, style: TextStyle(fontSize: 14.5, height: 1.45, color: Wa.text(context))),
                      const SizedBox(height: 16),
                      _Card(
                        children: [
                          _Row('Project', _project ?? t.projectId),
                          if (t.module != null) _Row('Module', t.module!),
                          _Row('Raised by', t.raisedBy?.label ?? '—'),
                          _Row('Assigned to', t.assignedTo?.label ?? 'Unassigned'),
                          if (t.createdAt != null) _Row('Created', DateFormat('dd MMM yyyy, h:mm a').format(t.createdAt!)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          if (_me.can(t.kind.module, 'status') && t.status.next.isNotEmpty)
                            Expanded(
                              child: FilledButton.icon(
                                onPressed: _busy ? null : _changeStatus,
                                icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                                label: const Text('Change status'),
                              ),
                            ),
                          if (_me.can(t.kind.module, 'status') && t.status.next.isNotEmpty && _me.can(t.kind.module, 'assign')) const SizedBox(width: 10),
                          if (_me.can(t.kind.module, 'assign'))
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: _busy ? null : _assign,
                                icon: const Icon(Icons.person_add_alt_1_rounded, size: 18),
                                label: const Text('Assign'),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Comments & updates',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Wa.text(context)),
                      ),
                      const SizedBox(height: 8),
                      for (final c in _comments) _CommentTile(c),
                    ],
                  ),
                ),
                _CommentBar(controller: _comment, sending: _sending, onSend: _send),
              ],
            ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    decoration: BoxDecoration(
      color: Wa.surface(context),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Wa.border(context)),
    ),
    child: Column(children: children),
  );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(label, style: TextStyle(color: Wa.muted(context), fontSize: 13)),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: Wa.text(context)),
          ),
        ),
      ],
    ),
  );
}

class _CommentTile extends StatelessWidget {
  const _CommentTile(this.c);
  final TicketComment c;

  String get _update => switch (c.type) {
    'created' => 'raised this ticket',
    'status' => 'moved ${TicketStatus.of(c.from).label} → ${TicketStatus.of(c.to).label}',
    'assign' => c.to == null ? 'unassigned the ticket' : 'assigned to ${c.to}',
    'edit' => 'edited the ticket',
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final muted = Wa.muted(context);
    final who = c.by?.label ?? 'Someone';
    final when = c.at == null ? '' : DateFormat('dd MMM, h:mm a').format(c.at!);
    if (c.type != 'comment') {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            Icon(Icons.history_rounded, size: 15, color: muted),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: who,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    TextSpan(text: ' $_update'),
                  ],
                ),
                style: TextStyle(fontSize: 12.5, color: muted),
              ),
            ),
            Text(when, style: TextStyle(fontSize: 11, color: muted)),
          ],
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Avatar(name: who, seed: c.by?.uid ?? who, radius: 15),
          const SizedBox(width: 10),
          Expanded(
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              decoration: BoxDecoration(
                color: Wa.surface(context),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Wa.border(context)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          who,
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Wa.text(context)),
                        ),
                      ),
                      Text(when, style: TextStyle(fontSize: 11, color: muted)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  SelectableText(c.text ?? '', style: TextStyle(fontSize: 14, height: 1.4, color: Wa.text(context))),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentBar extends StatelessWidget {
  const _CommentBar({required this.controller, required this.sending, required this.onSend});
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Wa.surface(context),
      border: Border(top: BorderSide(color: Wa.border(context))),
    ),
    padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
    child: SafeArea(
      top: false,
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              minLines: 1,
              maxLines: 5,
              maxLength: 2000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'Add a comment', counterText: '', isDense: true),
            ),
          ),
          const SizedBox(width: 6),
          IconButton.filled(
            style: IconButton.styleFrom(backgroundColor: Wa.accent, foregroundColor: Wa.accentFg),
            onPressed: sending ? null : onSend,
            icon: sending
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, size: 20),
          ),
        ],
      ),
    ),
  );
}
