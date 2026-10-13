import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../app/locator.dart';
import '../../../app/theme.dart';
import '../../../core/backend.dart';
import '../../../data/chat_repository.dart';
import '../../../data/models.dart';
import 'avatar.dart';

/// Conversation chi sadhane (web `tools.tsx` sarkhi): forward, message info, reactions, search.

final _when = DateFormat('d MMM, h:mm a');

// ── Forward ──────────────────────────────────────────────────────────

/// Konala forward — people + groups (jithe mi pathavu shakto), kamal 5. true = gela.
Future<bool> showForwardSheet(BuildContext context, {required String chatId, required String me, required List<String> ids}) async {
  final ok = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _ForwardSheet(chatId: chatId, me: me, ids: ids),
  );
  return ok == true;
}

class _Target {
  const _Target(this.key, this.label, this.target, {this.user, this.chat});
  final String key;
  final String label;
  final Map<String, String> target;
  final ChatUser? user;
  final ChatSummary? chat;
}

class _ForwardSheet extends StatefulWidget {
  const _ForwardSheet({required this.chatId, required this.me, required this.ids});
  final String chatId;
  final String me;
  final List<String> ids;

  @override
  State<_ForwardSheet> createState() => _ForwardSheetState();
}

class _ForwardSheetState extends State<_ForwardSheet> {
  static const max = 5;
  final _repo = locator<ChatRepository>();
  List<_Target>? _options;
  final _picked = <String>{};
  String _q = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final users = await _repo.users();
      final chats = await _repo.myChats(widget.me).first;
      final recent = {for (final c in chats) c.id: c.updatedAt?.millisecondsSinceEpoch ?? 0};
      final groups = chats
          .where((c) => c.isGroup && c.members.contains(widget.me) && (!c.onlyAdminsSend || c.admins.contains(widget.me)))
          .map((c) => _Target(c.id, c.name, {'chatId': c.id}, chat: c));
      final people = users.map((u) => _Target(u.uid, u.label, {'to': u.uid}, user: u));
      int at(_Target t) => recent[t.chat?.id ?? chatIdOf(widget.me, t.key)] ?? 0;
      final all = [...groups, ...people]..sort((a, b) {
        final x = at(b).compareTo(at(a));
        return x != 0 ? x : a.label.toLowerCase().compareTo(b.label.toLowerCase());
      });
      if (mounted) setState(() => _options = all);
    } catch (e) {
      if (mounted) setState(() => _options = const []);
    }
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    final nav = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final targets = _options!.where((o) => _picked.contains(o.key)).map((o) => o.target).toList();
      await _repo.forward(widget.chatId, widget.ids, targets);
      messenger.showSnackBar(SnackBar(content: Text('Forwarded to ${targets.length} chat${targets.length == 1 ? '' : 's'}')));
      nav.pop(true);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = (_options ?? const <_Target>[]).where((o) => q.isEmpty || o.label.toLowerCase().contains(q)).toList();
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * .85,
      child: Column(
        children: [
          ListTile(
            title: const Text('Forward to…', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            subtitle: Text('${_picked.length} of $max selected'),
            trailing: FilledButton.icon(
              onPressed: _picked.isEmpty || _busy ? null : _send,
              icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send_rounded, size: 18),
              label: const Text('Send'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: const InputDecoration(hintText: 'Search people or groups', prefixIcon: Icon(Icons.search_rounded), isDense: true),
              onChanged: (v) => setState(() => _q = v),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _options == null
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final o = list[i];
                      final on = _picked.contains(o.key);
                      final full = !on && _picked.length >= max;
                      return CheckboxListTile(
                        value: on,
                        onChanged: full ? null : (v) => setState(() => v == true ? _picked.add(o.key) : _picked.remove(o.key)),
                        secondary: o.chat != null ? GroupAvatar(seed: o.chat!.id, photo: o.chat!.photo) : Avatar(name: o.label, seed: o.key),
                        title: Text(o.label, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(
                          o.chat != null ? '${o.chat!.members.length} members' : (o.user?.role ?? o.user?.email ?? ''),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Message info (✓✓ konakade) ───────────────────────────────────────

/// Pratyek recipient — read / delivered exact vel (juna message — watermark, vel nahi).
void showMessageInfo(BuildContext context, {required ChatMessage m, required ChatSummary? chat, required Map<String, String> names}) {
  final at = m.at;
  final members = chat?.members ?? const <String>[];
  final who = (m.to ?? members).where((u) => u != m.by && members.contains(u)).toList();
  bool upTo(Map<String, DateTime>? w, String u) => at != null && !(w?[u]?.isBefore(at) ?? true);
  final read = <String, DateTime?>{};
  final got = <String, DateTime?>{};
  final pending = <String>[];
  for (final u in who) {
    if (m.readBy.containsKey(u) || upTo(chat?.reads, u)) {
      read[u] = m.readBy[u];
    } else if (m.deliveredTo.containsKey(u) || upTo(chat?.delivered, u)) {
      got[u] = m.deliveredTo[u];
    } else {
      pending.add(u);
    }
  }
  Widget section(IconData icon, Color? color, String title, Map<String, DateTime?> rows) => rows.isEmpty
      ? const SizedBox.shrink()
      : Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Row(children: [Icon(icon, size: 18, color: color), const SizedBox(width: 6), Text(title, style: const TextStyle(fontWeight: FontWeight.w700))]),
            ),
            for (final e in rows.entries)
              ListTile(
                dense: true,
                leading: Avatar(name: names[e.key] ?? '?', seed: e.key, radius: 16),
                title: Text(names[e.key] ?? 'Member'),
                trailing: Text(e.value == null ? '' : _when.format(e.value!), style: TextStyle(fontSize: 12, color: Wa.muted(context))),
              ),
          ],
        );
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const ListTile(title: Text('Message info', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18))),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Wa.surface2(ctx), borderRadius: BorderRadius.circular(12)),
                child: Text(m.preview, maxLines: 4, overflow: TextOverflow.ellipsis),
              ),
            ),
            section(Icons.done_all_rounded, const Color(0xFF38BDF8), 'Read by', read),
            section(Icons.done_all_rounded, null, 'Delivered to', got),
            section(Icons.done_rounded, null, 'Sent (not delivered yet)', {for (final u in pending) u: null}),
            const SizedBox(height: 12),
          ],
        ),
      ),
    ),
  );
}

// ── Reactions (konakonache) ──────────────────────────────────────────

void showReactions(BuildContext context, {required ChatMessage m, required String me, required Map<String, String> names, required void Function(String?) onReact}) {
  showModalBottomSheet<void>(
    context: context,
    builder: (ctx) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        children: [
          ListTile(title: Text('Reactions · ${m.reactions.length}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18))),
          for (final e in m.reactions.entries)
            ListTile(
              leading: Avatar(name: names[e.key] ?? '?', seed: e.key, radius: 18),
              title: Text(e.key == me ? 'You' : (names[e.key] ?? 'Member')),
              subtitle: e.key == me ? const Text('Tap to remove') : null,
              trailing: Text(e.value, style: const TextStyle(fontSize: 24)),
              onTap: e.key == me
                  ? () {
                      Navigator.pop(ctx);
                      onReact(null);
                    }
                  : null,
            ),
        ],
      ),
    ),
  );
}

// ── Search ───────────────────────────────────────────────────────────

/// Conversation madhe shodh — text, pathavnara, `@naav`, file naav, tarikh. Message id parat.
class ChatSearchView extends StatefulWidget {
  const ChatSearchView({super.key, required this.messages, required this.me, required this.names});
  final List<ChatMessage> messages;
  final String me;
  final Map<String, String> names;

  @override
  State<ChatSearchView> createState() => _ChatSearchViewState();
}

class _ChatSearchViewState extends State<ChatSearchView> {
  String _q = '';
  DateTime? _day;

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final results = (q.isEmpty && _day == null)
        ? const <ChatMessage>[]
        : widget.messages.reversed.where((m) {
            if (m.system || m.deleted) return false;
            final at = m.at;
            if (_day != null && (at == null || at.year != _day!.year || at.month != _day!.month || at.day != _day!.day)) return false;
            if (q.isEmpty) return true;
            if (q.startsWith('@')) return m.mentions.any((u) => (widget.names[u] ?? '').toLowerCase().contains(q.substring(1)));
            final who = (m.by == widget.me ? 'you' : m.byName).toLowerCase();
            return m.text.toLowerCase().contains(q) || who.contains(q) || (m.attachment?.name.toLowerCase().contains(q) ?? false);
          }).toList();
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Search messages, people, @mentions, files', border: InputBorder.none, filled: false),
          onChanged: (v) => setState(() => _q = v),
        ),
        actions: [
          IconButton(
            tooltip: 'Search by date',
            icon: Icon(Icons.calendar_month_rounded, color: _day != null ? Wa.accent : null),
            onPressed: () async {
              final d = await showDatePicker(context: context, firstDate: DateTime(2024), lastDate: DateTime.now(), initialDate: _day ?? DateTime.now());
              setState(() => _day = d);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          if (_day != null)
            ListTile(
              dense: true,
              leading: const Icon(Icons.event_rounded, size: 18),
              title: Text(DateFormat('d MMM y').format(_day!)),
              trailing: IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => setState(() => _day = null)),
            ),
          Expanded(
            child: q.isEmpty && _day == null
                ? Center(child: Text('Search messages, senders, @mentions or file names', style: TextStyle(color: Wa.muted(context))))
                : results.isEmpty
                ? Center(child: Text('No results', style: TextStyle(color: Wa.muted(context))))
                : ListView.separated(
                    itemCount: results.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (_, i) {
                      final m = results[i];
                      return ListTile(
                        title: Text(m.by == widget.me ? 'You' : m.byName, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(m.preview, maxLines: 2, overflow: TextOverflow.ellipsis),
                        trailing: Text(m.at == null ? '' : _when.format(m.at!), style: TextStyle(fontSize: 11.5, color: Wa.muted(context))),
                        onTap: () => Navigator.pop(context, m.id),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
