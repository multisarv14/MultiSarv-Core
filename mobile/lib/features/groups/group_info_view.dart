import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/chat_repository.dart';
import '../../data/models.dart';
import '../../services/session_service.dart';
import '../conversation/conversation_view.dart';
import '../conversation/widgets/avatar.dart';
import '../conversation/widgets/bubble.dart' show linksIn;
import 'group_photo.dart';
import 'new_group_view.dart';

/// Group info — web `GroupInfo` sarkha: photo / naav / description (admin badalto), notifications,
/// group settings, media · files · links, starred, members (admin: add / remove / admin banva), soda.
///
/// Parat (pop) — `'search'` kinva `'jump:<messageId>'` (conversation te karto).
class GroupInfoView extends StatefulWidget {
  const GroupInfoView({super.key, required this.chatId});
  final String chatId;

  @override
  State<GroupInfoView> createState() => _GroupInfoViewState();
}

class _GroupInfoViewState extends State<GroupInfoView> {
  final _repo = locator<ChatRepository>();
  final String me = locator<SessionService>().me.uid;
  late final StreamSubscription<ChatSummary?> _sub;
  late final StreamSubscription<List<ChatMessage>> _msgSub;
  ChatSummary? _g;
  List<ChatMessage>? _msgs;
  Map<String, ChatUser> _users = const {};
  bool _busy = false;
  String _memberQ = '';

  @override
  void initState() {
    super.initState();
    _sub = _repo.chat(widget.chatId, me).listen((g) {
      if (mounted) setState(() => _g = g);
    }, onError: (Object _) {});
    _msgSub = _repo.messages(widget.chatId, me).listen((m) {
      if (mounted) setState(() => _msgs = m);
    }, onError: (Object _) {});
    _repo.users().then((u) {
      if (mounted) setState(() => _users = {for (final x in u) x.uid: x});
    }, onError: (Object _) {});
  }

  @override
  void dispose() {
    _sub.cancel();
    _msgSub.cancel();
    super.dispose();
  }

  bool get _admin => _g?.admins.contains(me) ?? false;
  bool get _member => _g?.members.contains(me) ?? false;
  String _name(String uid) => uid == me ? 'You' : (_g?.names[uid] ?? _users[uid]?.label ?? 'Member');

  Future<bool> _run(Future<void> Function() job, [String? done]) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await job();
      if (done != null) messenger.showSnackBar(SnackBar(content: Text(done)));
      return true;
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
      return false;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _edit(String title, String initial, {int max = 60, int lines = 1, String hint = ''}) async {
    final c = TextEditingController(text: initial);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLength: max,
          minLines: 1,
          maxLines: lines,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(hintText: hint),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Save')),
        ],
      ),
    );
    c.dispose();
    return v;
  }

  Future<void> _rename() async {
    final name = await _edit('Group name', _g!.name);
    if (name == null || name.trim().isEmpty || name.trim() == _g!.name) return;
    await _run(() => _repo.updateGroup(widget.chatId, name: name.trim()), 'Group updated');
  }

  Future<void> _describe() async {
    final d = await _edit('Group description', _g!.description, max: 500, lines: 5, hint: 'What is this group for?');
    if (d == null || d.trim() == _g!.description) return;
    await _run(() => _repo.updateGroup(widget.chatId, description: d.trim()), 'Group updated');
  }

  /// Camera / gallery → preview → Save (WhatsApp sarkha).
  Future<void> _photo() async {
    final src = await pickPhotoSource(context, canRemove: (_g?.photo ?? '').isNotEmpty);
    if (src == null || !mounted) return;
    if (src == PhotoSource.remove) {
      await _run(() => _repo.updateGroup(widget.chatId, photo: ''), 'Photo removed');
      return;
    }
    final f = await pickGroupPhoto(src);
    if (f == null || !mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Group photo'),
        content: ClipOval(child: Image.file(f, width: 200, height: 200, fit: BoxFit.cover)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok == true) await _run(() => _repo.setGroupPhoto(me, widget.chatId, File(f.path)), 'Photo updated');
  }

  void _add() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => MemberPicker(
          title: 'Add members',
          action: 'Add',
          exclude: _g!.members.toSet(),
          onDone: (picked) {
            Navigator.pop(ctx);
            _run(() => _repo.updateGroup(widget.chatId, add: picked.map((u) => u.uid).toList()), 'Members added');
          },
        ),
      ),
    );
  }

  /// Employee profile — message, ani admin asel tar admin banva / kadha / group madhun kadha.
  void _profile(String uid) {
    final g = _g!;
    final u = _users[uid];
    final isAdmin = g.admins.contains(uid);
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Avatar(name: _name(uid), seed: uid, radius: 36),
              const SizedBox(height: 10),
              Text(_name(uid), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
              if (u?.role != null) Text(u!.role!, style: TextStyle(color: Wa.muted(ctx))),
              if (u != null) Text(u.email, style: TextStyle(color: Wa.muted(ctx), fontSize: 13)),
              if (u == null) Text('No longer active', style: TextStyle(color: Wa.muted(ctx))),
              if (isAdmin) ...[const SizedBox(height: 8), const _AdminChip()],
              const SizedBox(height: 14),
              if (u != null)
                ListTile(
                  leading: const Icon(Icons.chat_rounded, color: Wa.accent),
                  title: Text('Message ${u.label.split(' ').first}'),
                  onTap: () {
                    Navigator.pop(ctx);
                    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ConversationView(other: u)));
                  },
                ),
              if (_admin) ...[
                ListTile(
                  leading: const Icon(Icons.admin_panel_settings_outlined),
                  title: Text(isAdmin ? 'Dismiss as admin' : 'Make group admin'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _run(
                      () => _repo.updateGroup(widget.chatId, promote: isAdmin ? null : [uid], demote: isAdmin ? [uid] : null),
                      isAdmin ? 'Admin removed' : 'Now a group admin',
                    );
                  },
                ),
                ListTile(
                  leading: Icon(Icons.person_remove_outlined, color: Theme.of(ctx).colorScheme.error),
                  title: Text('Remove from group', style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _remove(uid);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _remove(String uid) async {
    final name = _name(uid);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove $name?'),
        content: const Text("They'll stop receiving messages and can no longer see this group."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok == true) await _run(() => _repo.updateGroup(widget.chatId, remove: [uid]), '$name removed');
  }

  Future<void> _leave() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave group?'),
        content: const Text("You won't get new messages from this group."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final nav = Navigator.of(context);
    await _run(() => _repo.leaveGroup(widget.chatId));
    nav.popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final g = _g;
    final muted = Wa.muted(context);
    if (g == null) {
      return Scaffold(appBar: AppBar(), body: const Center(child: CircularProgressIndicator()));
    }
    final q = _memberQ.trim().toLowerCase();
    // "You" adhi, mag admins, mag naav.
    final members = g.members.where((u) => q.isEmpty || _name(u).toLowerCase().contains(q) || (_users[u]?.email.toLowerCase().contains(q) ?? false)).toList()
      ..sort((a, b) {
        if (a == me) return -1;
        if (b == me) return 1;
        final x = (g.admins.contains(b) ? 1 : 0).compareTo(g.admins.contains(a) ? 1 : 0);
        return x != 0 ? x : _name(a).toLowerCase().compareTo(_name(b).toLowerCase());
      });
    final mode = g.notifyFor(me);
    final starred = (_msgs ?? const <ChatMessage>[]).where((m) => m.starred && !m.deleted).toList().reversed.toList();
    final fmt = DateFormat('d MMM y, h:mm a');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group info', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
        bottom: _busy ? const PreferredSize(preferredSize: Size.fromHeight(2), child: LinearProgressIndicator(minHeight: 2)) : null,
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          const SizedBox(height: 24),
          // Photo — admin la camera / gallery.
          Center(
            child: GestureDetector(
              onTap: _admin && !_busy ? _photo : null,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  GroupAvatar(seed: g.id, radius: 52, hero: true, photo: g.photo),
                  if (_admin)
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: Wa.accent, shape: BoxShape.circle, border: Border.all(color: Wa.bg(context), width: 3)),
                        child: const Icon(Icons.photo_camera_rounded, size: 18, color: Colors.white),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Rise(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: Text(
                    g.name,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -.4, color: Wa.text(context)),
                  ),
                ),
                // Naav badal fakt group admin (server pan tapasto).
                if (_admin) IconButton(icon: Icon(Icons.edit_rounded, size: 18, color: muted), tooltip: 'Rename', onPressed: _busy ? null : _rename),
              ],
            ),
          ),
          Rise(
            index: 1,
            child: Text('Group · ${g.members.length} members', textAlign: TextAlign.center, style: TextStyle(color: muted)),
          ),
          const SizedBox(height: 12),
          Center(
            child: OutlinedButton.icon(
              onPressed: () => Navigator.pop(context, 'search'),
              icon: const Icon(Icons.search_rounded, size: 18),
              label: const Text('Search messages'),
            ),
          ),
          const SizedBox(height: 20),

          // Description + kuni / kadhi banavla + admins.
          _Section(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: g.description.isEmpty
                          ? Text(_admin ? 'Add group description' : 'No description', style: TextStyle(color: _admin ? Wa.accent : muted, fontWeight: FontWeight.w600))
                          : Text(g.description, style: TextStyle(color: Wa.text(context), height: 1.35)),
                    ),
                    if (_admin) IconButton(icon: Icon(Icons.edit_rounded, size: 18, color: muted), onPressed: _busy ? null : _describe),
                  ],
                ),
              ),
              _Info('Created by', _name(g.createdBy)),
              _Info('Created on', g.createdAt == null ? '—' : fmt.format(g.createdAt!)),
              _Info('Admins', g.admins.where(g.members.contains).map(_name).join(', ')),
              const SizedBox(height: 8),
            ],
          ),
          const SizedBox(height: 16),

          _SharedSection(chatId: widget.chatId, me: me, messages: _msgs, onJump: (id) => Navigator.pop(context, 'jump:$id')),
          const SizedBox(height: 16),

          if (starred.isNotEmpty) ...[
            _Section(
              title: 'STARRED MESSAGES (${starred.length})',
              children: [
                for (final m in starred.take(5))
                  ListTile(
                    leading: const Icon(Icons.star_rounded, color: Color(0xFFF59E0B)),
                    title: Text(m.by == me ? 'You' : m.byName, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(m.preview, maxLines: 1, overflow: TextOverflow.ellipsis),
                    onTap: () => Navigator.pop(context, 'jump:${m.id}'),
                  ),
              ],
            ),
            const SizedBox(height: 16),
          ],

          // Notifications — fakt majhyasathi.
          _Section(
            title: 'NOTIFICATIONS',
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
                child: SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'all', label: Text('All'), icon: Icon(Icons.notifications_active_outlined)),
                    ButtonSegment(value: 'mentions', label: Text('Mentions'), icon: Icon(Icons.alternate_email_rounded)),
                    ButtonSegment(value: 'off', label: Text('Off'), icon: Icon(Icons.notifications_off_outlined)),
                  ],
                  selected: {mode},
                  showSelectedIcon: false,
                  onSelectionChanged: _busy ? null : (s) => _run(() => _repo.setNotify(widget.chatId, s.first)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                child: Text(
                  switch (mode) {
                    'mentions' => 'Only when someone @mentions you or replies to your message.',
                    'off' => 'No notifications from this group — other chats are not affected.',
                    _ => 'You will be notified for every new message.',
                  },
                  style: TextStyle(color: muted, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Group settings.
          _Section(
            title: 'GROUP SETTINGS',
            children: [
              SwitchListTile(
                value: g.onlyAdminsSend,
                onChanged: _admin && !_busy ? (v) => _run(() => _repo.updateGroup(widget.chatId, onlyAdminsSend: v), 'Group updated') : null,
                title: const Text('Only admins can send messages', style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(g.onlyAdminsSend ? 'Members can read but not send' : 'All members can send messages'),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                child: Text('Only admins can edit the group name, photo, description and members.', style: TextStyle(color: muted, fontSize: 13)),
              ),
            ],
          ),
          const SizedBox(height: 16),

          _Section(
            title: '${g.members.length} MEMBERS',
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                child: TextField(
                  decoration: const InputDecoration(hintText: 'Search members', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                  onChanged: (v) => setState(() => _memberQ = v),
                ),
              ),
              if (_admin && q.isEmpty)
                _Row(
                  leading: const CircleAvatar(radius: 20, backgroundColor: Wa.accent, child: Icon(Icons.person_add_alt_1_rounded, color: Colors.white, size: 20)),
                  title: 'Add members',
                  titleColor: Wa.accent,
                  onTap: _busy ? null : _add,
                ),
              for (final (i, uid) in members.indexed)
                Rise(
                  key: ValueKey(uid),
                  index: i,
                  child: _Row(
                    leading: Avatar(name: _name(uid), seed: uid, radius: 20),
                    title: _name(uid),
                    trailing: g.admins.contains(uid) ? const _AdminChip() : null,
                    onTap: uid == me || _busy ? null : () => _profile(uid),
                  ),
                ),
              if (members.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text('No matching members', style: TextStyle(color: muted))),
            ],
          ),
          if (_member) ...[
            const SizedBox(height: 16),
            _Section(
              children: [
                _Row(
                  leading: Icon(Icons.logout_rounded, color: Theme.of(context).colorScheme.error),
                  title: 'Leave group',
                  titleColor: Theme.of(context).colorScheme.error,
                  onTap: _busy ? null : _leave,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _AdminChip extends StatelessWidget {
  const _AdminChip();

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(color: Wa.accent.withValues(alpha: .12), borderRadius: BorderRadius.circular(8)),
    child: const Text('Group admin', style: TextStyle(color: Wa.accent, fontSize: 11.5, fontWeight: FontWeight.w700)),
  );
}

class _Info extends StatelessWidget {
  const _Info(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 92, child: Text(label, style: TextStyle(color: Wa.muted(context), fontSize: 13))),
        Expanded(child: Text(value.isEmpty ? '—' : value, style: const TextStyle(fontSize: 13.5))),
      ],
    ),
  );
}

/// Media · Files · Links (load zalelya messages madhun) — shodh, ughda, message var ja.
class _SharedSection extends StatefulWidget {
  const _SharedSection({required this.chatId, required this.me, required this.messages, required this.onJump});
  final String chatId;
  final String me;
  final List<ChatMessage>? messages;
  final void Function(String id) onJump;

  @override
  State<_SharedSection> createState() => _SharedSectionState();
}

class _SharedSectionState extends State<_SharedSection> {
  String _tab = 'media';
  String _q = '';
  bool _all = false;

  @override
  Widget build(BuildContext context) {
    final live = (widget.messages ?? const <ChatMessage>[]).where((m) => !m.deleted && !m.system).toList().reversed.toList();
    final q = _q.trim().toLowerCase();
    bool hit(ChatMessage m, [String extra = '']) =>
        q.isEmpty || m.text.toLowerCase().contains(q) || (m.attachment?.name.toLowerCase().contains(q) ?? false) || m.byName.toLowerCase().contains(q) || extra.toLowerCase().contains(q);
    final media = live.where((m) => m.attachment != null && (m.attachment!.isImage || m.attachment!.isVideo) && hit(m)).toList();
    final files = live.where((m) => m.attachment != null && !m.attachment!.isImage && !m.attachment!.isVideo && !m.attachment!.isAudio && hit(m)).toList();
    final links = [
      for (final m in live)
        for (final l in linksIn(m.text))
          if (hit(m, l)) (url: l, m: m),
    ];
    final muted = Wa.muted(context);
    final cap = _all ? 1 << 30 : (_tab == 'media' ? 9 : 5);
    final count = switch (_tab) {
      'files' => files.length,
      'links' => links.length,
      _ => media.length,
    };
    final fmt = DateFormat('d MMM, h:mm a');

    return _Section(
      title: 'MEDIA, FILES AND LINKS',
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 6),
          child: SegmentedButton<String>(
            segments: [
              ButtonSegment(value: 'media', label: Text('Media ${media.length}')),
              ButtonSegment(value: 'files', label: Text('Files ${files.length}')),
              ButtonSegment(value: 'links', label: Text('Links ${links.length}')),
            ],
            selected: {_tab},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() {
              _tab = s.first;
              _all = false;
            }),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Search shared items', prefixIcon: Icon(Icons.search_rounded), isDense: true),
            onChanged: (v) => setState(() => _q = v),
          ),
        ),
        if (widget.messages == null)
          const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
        else if (count == 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
            child: Text(switch (_tab) {
              'files' => 'No files shared yet',
              'links' => 'No links shared yet',
              _ => 'No media shared yet',
            }, style: TextStyle(color: muted)),
          )
        else if (_tab == 'media')
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 6,
              crossAxisSpacing: 6,
              children: [for (final m in media.take(cap)) _Thumb(m: m, onTap: () => widget.onJump(m.id))],
            ),
          )
        else if (_tab == 'files')
          for (final m in files.take(cap))
            ListTile(
              leading: const Icon(Icons.insert_drive_file_rounded, color: Wa.accent),
              title: Text(m.attachment!.name, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text('${m.by == widget.me ? 'You' : m.byName} · ${m.at == null ? '' : fmt.format(m.at!)}'),
              onTap: () async {
                final url = await locator<ChatRepository>().attachmentUrl(m.attachment!.path);
                await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
              },
            )
        else
          for (final l in links.take(cap))
            ListTile(
              leading: const Icon(Icons.link_rounded, color: Wa.accent),
              title: Text(l.url, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Wa.accent)),
              subtitle: Text('${l.m.by == widget.me ? 'You' : l.m.byName} · ${l.m.at == null ? '' : fmt.format(l.m.at!)}'),
              onTap: () => launchUrl(Uri.parse(l.url.startsWith('http') ? l.url : 'https://${l.url}'), mode: LaunchMode.externalApplication),
              onLongPress: () => widget.onJump(l.m.id),
            ),
        if (!_all && count > cap)
          TextButton(onPressed: () => setState(() => _all = true), child: Text('Show all ($count)')),
      ],
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.m, required this.onTap});
  final ChatMessage m;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final a = m.attachment!;
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Container(
          color: Wa.surface2(context),
          child: a.isVideo
              ? const Center(child: Icon(Icons.play_circle_fill_rounded, size: 34, color: Colors.white70))
              : FutureBuilder<String>(
                  future: locator<ChatRepository>().attachmentUrl(a.path),
                  builder: (_, s) => s.data == null ? const SizedBox.shrink() : Image.network(s.data!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
                ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({this.title, required this.children});
  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              title!,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .8, color: Wa.muted(context)),
            ),
          ),
        Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: Wa.surface(context),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Wa.border(context)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({required this.leading, required this.title, this.trailing, this.onTap, this.titleColor});
  final Widget leading;
  final String title;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color? titleColor;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          children: [
            SizedBox(width: 40, child: Center(child: leading)),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: titleColor ?? Wa.text(context)),
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    ),
  );
}
