import 'dart:io';

import 'package:flutter/material.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/chat_repository.dart';
import '../../data/models.dart';
import '../../services/session_service.dart';
import 'group_photo.dart';
import '../conversation/conversation_view.dart';
import '../conversation/widgets/avatar.dart';

/// WhatsApp sarkha: 1) members nivada → 2) group la naav → chat ughadto.
class NewGroupView extends StatelessWidget {
  const NewGroupView({super.key});

  @override
  Widget build(BuildContext context) => MemberPicker(
    title: 'New group',
    action: 'Next',
    onDone: (picked) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _NameGroupView(members: picked))),
  );
}

/// Core users madhun anek nivadne (search + chips). `exclude` = adhich group madhe.
class MemberPicker extends StatefulWidget {
  const MemberPicker({super.key, required this.title, required this.action, required this.onDone, this.exclude = const {}});
  final String title;
  final String action;
  final Set<String> exclude;
  final void Function(List<ChatUser> picked) onDone;

  @override
  State<MemberPicker> createState() => _MemberPickerState();
}

class _MemberPickerState extends State<MemberPicker> {
  final _picked = <String, ChatUser>{};
  List<ChatUser>? _users;
  String? _error;
  String _q = '';

  @override
  void initState() {
    super.initState();
    locator<ChatRepository>()
        .users()
        .then((u) {
          if (mounted) setState(() => _users = u.where((x) => !widget.exclude.contains(x.uid)).toList());
        })
        .catchError((Object e) {
          if (mounted) setState(() => (_users = const [], _error = errorText(e)));
        });
  }

  void _toggle(ChatUser u) => setState(() => _picked.containsKey(u.uid) ? _picked.remove(u.uid) : _picked[u.uid] = u);

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = (_users ?? const <ChatUser>[]).where((u) => q.isEmpty || u.name.toLowerCase().contains(q) || u.email.toLowerCase().contains(q)).toList();
    final muted = Wa.muted(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: Text(
                _picked.isEmpty ? 'Add members' : '${_picked.length} selected',
                key: ValueKey(_picked.length),
                style: TextStyle(fontSize: 12, color: muted),
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: AnimatedScale(
        scale: _picked.isEmpty ? 0 : 1,
        duration: const Duration(milliseconds: 250),
        curve: _picked.isEmpty ? Curves.easeIn : Curves.easeOutBack,
        child: FloatingActionButton.extended(
          onPressed: _picked.isEmpty ? null : () => widget.onDone(_picked.values.toList()),
          backgroundColor: Wa.accent,
          foregroundColor: Wa.accentFg,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          icon: const Icon(Icons.arrow_forward_rounded),
          label: Text(widget.action, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ),
      body: Column(
        children: [
          // Nivadlele — var adva chips (tap = kadha).
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: easeOutSoft,
            child: _picked.isEmpty
                ? const SizedBox(width: double.infinity)
                : SizedBox(
                    height: 92,
                    child: ListView(
                      scrollDirection: Axis.horizontal,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                      children: [
                        for (final u in _picked.values)
                          Rise(
                            key: ValueKey(u.uid),
                            offset: 8,
                            duration: const Duration(milliseconds: 250),
                            child: Pressable(
                              onTap: () => _toggle(u),
                              child: SizedBox(
                                width: 64,
                                child: Column(
                                  children: [
                                    Stack(
                                      clipBehavior: Clip.none,
                                      children: [
                                        Avatar(name: u.label, seed: u.uid, radius: 24),
                                        Positioned(
                                          right: -2,
                                          bottom: -2,
                                          child: Container(
                                            padding: const EdgeInsets.all(2),
                                            decoration: BoxDecoration(
                                              color: Wa.text(context),
                                              shape: BoxShape.circle,
                                              border: Border.all(color: Wa.bg(context), width: 2),
                                            ),
                                            child: Icon(Icons.close_rounded, size: 12, color: Wa.bg(context)),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 6),
                                    Text(u.label.split(' ').first, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              onChanged: (v) => setState(() => _q = v),
              decoration: const InputDecoration(hintText: 'Search people', prefixIcon: Icon(Icons.search_rounded, size: 20), isDense: true),
            ),
          ),
          Expanded(
            child: _users == null
                ? const Center(child: CircularProgressIndicator())
                : list.isEmpty
                ? Center(
                    child: Text(_error ?? 'No one to add', style: TextStyle(color: muted)),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.only(bottom: 96),
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final u = list[i];
                      final on = _picked.containsKey(u.uid);
                      return Rise(
                        key: ValueKey(u.uid),
                        index: i,
                        child: InkWell(
                          onTap: () => _toggle(u),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                            child: Row(
                              children: [
                                Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    Avatar(name: u.label, seed: u.uid, radius: 22),
                                    Positioned(
                                      right: -2,
                                      bottom: -2,
                                      child: AnimatedScale(
                                        scale: on ? 1 : 0,
                                        duration: const Duration(milliseconds: 250),
                                        curve: on ? Curves.easeOutBack : Curves.easeIn,
                                        child: Container(
                                          decoration: BoxDecoration(
                                            color: Wa.accent,
                                            shape: BoxShape.circle,
                                            border: Border.all(color: Wa.bg(context), width: 2),
                                          ),
                                          child: const Icon(Icons.check_rounded, size: 14, color: Colors.white),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        u.label,
                                        style: TextStyle(fontWeight: FontWeight.w600, fontSize: 15.5, color: Wa.text(context)),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        u.role ?? u.email,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(fontSize: 13, color: muted),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
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

/// Step 2 — naav (ani members chi jhalak), "Create".
class _NameGroupView extends StatefulWidget {
  const _NameGroupView({required this.members});
  final List<ChatUser> members;

  @override
  State<_NameGroupView> createState() => _NameGroupViewState();
}

class _NameGroupViewState extends State<_NameGroupView> {
  final _name = TextEditingController();
  final _desc = TextEditingController();
  File? _photo;
  bool _busy = false;
  int _errors = 0;

  /// Group photo — camera kinva gallery (512px JPEG).
  Future<void> _pickPhoto() async {
    final src = await pickPhotoSource(context, canRemove: _photo != null);
    if (src == null) return;
    if (src == PhotoSource.remove) return setState(() => _photo = null);
    final f = await pickGroupPhoto(src);
    if (f != null) setState(() => _photo = f);
  }

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    if (name.isEmpty) return setState(() => _errors++);
    setState(() => _busy = true);
    try {
      final repo = locator<ChatRepository>();
      final id = await repo.createGroup(name, widget.members.map((u) => u.uid).toList(), description: _desc.text.trim());
      // Photo — group banlyavar (storage rules member tapasta). Fail zala tari group ahe.
      if (_photo != null) {
        await repo.setGroupPhoto(locator<SessionService>().me.uid, id, _photo!).catchError((Object _) {
          if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Couldn't set the group photo.")));
        });
      }
      if (!mounted) return;
      final nav = Navigator.of(context);
      // Picker ani ha screen band — chats list var navin group chat.
      nav.popUntil((r) => r.isFirst);
      nav.push(
        MaterialPageRoute(
          builder: (_) => ConversationView.group(
            ChatSummary(id: id, other: '', lastText: '', lastBy: '', lastAttachment: null, updatedAt: null, unread: false, isGroup: true, name: name),
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final muted = Wa.muted(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Group name', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : _create,
        backgroundColor: Wa.accent,
        foregroundColor: Wa.accentFg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        icon: _busy
            ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
            : const Icon(Icons.check_rounded),
        label: const Text('Create', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
        children: [
          Center(
            child: Rise(
              child: GestureDetector(
                onTap: _pickPhoto,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    if (_photo != null)
                      ClipOval(child: Image.file(_photo!, width: 96, height: 96, fit: BoxFit.cover))
                    else
                      AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                child: _name.text.trim().isEmpty
                    ? Container(
                        key: const ValueKey(0),
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Wa.surface2(context),
                          border: Border.all(color: Wa.border(context)),
                        ),
                        child: Icon(Icons.groups_rounded, size: 44, color: muted),
                      )
                    : Container(
                        key: const ValueKey(1),
                        width: 96,
                        height: 96,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(colors: [Wa.logoFrom, Wa.logoTo]),
                        ),
                        child: Text(
                          _name.text.trim().characters.first.toUpperCase(),
                          style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w700),
                        ),
                      ),
                      ),
                    // Camera / gallery icon (WhatsApp sarkha).
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(color: Wa.accent, shape: BoxShape.circle, border: Border.all(color: Wa.bg(context), width: 3)),
                        child: const Icon(Icons.photo_camera_rounded, size: 18, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Rise(
            index: 1,
            child: Shake(
              trigger: _errors,
              child: TextField(
                controller: _name,
                autofocus: true,
                maxLength: 60,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _create(),
                decoration: InputDecoration(
                  hintText: 'Group name (e.g. Sales team)',
                  prefixIcon: const Icon(Icons.edit_rounded, size: 20),
                  errorText: _errors > 0 && _name.text.trim().isEmpty ? 'Give your group a name' : null,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Rise(
            index: 2,
            child: TextField(
              controller: _desc,
              maxLength: 500,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'Description (optional)', prefixIcon: Icon(Icons.notes_rounded, size: 20)),
            ),
          ),
          const SizedBox(height: 18),
          Rise(
            index: 2,
            child: Text(
              '${widget.members.length + 1} MEMBERS',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .8, color: muted),
            ),
          ),
          const SizedBox(height: 12),
          Rise(
            index: 3,
            child: Wrap(
              spacing: 14,
              runSpacing: 14,
              children: [
                for (final u in widget.members)
                  SizedBox(
                    width: 60,
                    child: Column(
                      children: [
                        Avatar(name: u.label, seed: u.uid, radius: 24),
                        const SizedBox(height: 6),
                        Text(u.label.split(' ').first, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
