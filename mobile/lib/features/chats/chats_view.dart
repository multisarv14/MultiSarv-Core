import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:stacked/stacked.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/chat_repository.dart';
import '../../data/models.dart';
import '../../services/push_service.dart';
import '../../services/session_service.dart';
import '../conversation/conversation_view.dart';
import '../conversation/widgets/avatar.dart';
import '../groups/new_group_view.dart';

/// List madhli ek line — 1:1 (`user`) kinva group (`user` null, `chat.isGroup`).
class ChatRow {
  const ChatRow(this.user, this.chat);
  final ChatUser? user;
  final ChatSummary? chat;

  bool get isGroup => user == null;
  String get key => user?.uid ?? chat!.id;
  String get title => user?.label ?? chat!.name;
}

class ChatsViewModel extends BaseViewModel {
  final _repo = locator<ChatRepository>();
  final _session = locator<SessionService>();
  final _push = locator<PushService>();

  List<ChatUser>? users;
  List<ChatSummary> chats = const [];
  String query = '';
  String? message;
  StreamSubscription<List<ChatSummary>>? _sub;

  Me get me => _session.me;

  Future<void> init() async {
    _sub = _repo.myChats(me.uid).listen((c) {
      chats = c;
      notifyListeners();
      _ackDelivered(c);
    }, onError: (Object _) {});
    await load();
    _push.onOpenChat = openChatWith;
    _push.start();
  }

  /// Kontya chat cha kontya vel paryant "delivered" pathavla (ekach vel dusryanda nahi).
  final _acked = <String, DateTime>{};

  /// ✓✓ grey — navin (dusryanche) messages ya phone var aale. Server watermark pan tapasto.
  void _ackDelivered(List<ChatSummary> list) {
    final me = this.me.uid;
    final due = list.where((c) {
      final at = c.updatedAt;
      if (at == null || c.lastBy == me || c.lastSystem) return false;
      final got = c.deliveredFor(me);
      if (got != null && !got.isBefore(at)) return false;
      final sent = _acked[c.id];
      return sent == null || sent.isBefore(at);
    }).toList();
    if (due.isEmpty) return;
    for (final c in due) {
      _acked[c.id] = c.updatedAt!;
    }
    _repo.markDelivered(due.map((c) => c.id).toList()).catchError((Object _) {});
  }

  Future<void> load({bool fresh = false}) async {
    try {
      users = await _repo.users(fresh: fresh);
      message = null;
    } catch (e) {
      message = errorText(e);
      users ??= const [];
    }
    notifyListeners();
  }

  /// Users + groups — recent adhi, mag naav (web `useChatDirectory` sarkha).
  List<ChatRow> get rows {
    final byOther = {for (final c in chats.where((c) => !c.isGroup)) c.other: c};
    final q = query.trim().toLowerCase();
    final list = [
      ...(users ?? const <ChatUser>[])
          .where((u) => q.isEmpty || u.name.toLowerCase().contains(q) || u.email.toLowerCase().contains(q))
          .map((u) => ChatRow(u, byOther[u.uid])),
      // Group naav kinva tyatla konihi member (web sarkha).
      ...chats
          .where((c) => c.isGroup && (q.isEmpty || c.name.toLowerCase().contains(q) || c.members.any((m) => (c.names[m] ?? '').toLowerCase().contains(q))))
          .map((c) => ChatRow(null, c)),
    ];
    list.sort((a, b) {
      final t = (b.chat?.updatedAt?.millisecondsSinceEpoch ?? 0).compareTo(a.chat?.updatedAt?.millisecondsSinceEpoch ?? 0);
      return t != 0 ? t : a.title.toLowerCase().compareTo(b.title.toLowerCase());
    });
    return list;
  }

  int get unread => chats.where((c) => c.unread).length;

  void search(String q) {
    query = q;
    notifyListeners();
  }

  /// "Unread" / "Groups" chip.
  String filter = 'all';

  void setFilter(String v) {
    filter = v;
    notifyListeners();
  }

  List<ChatRow> get visible => switch (filter) {
    'unread' => rows.where((r) => r.chat?.unread ?? false).toList(),
    'groups' => rows.where((r) => r.isGroup).toList(),
    _ => rows,
  };

  void open(ChatRow r, {String? messageId}) {
    navigatorKey.currentState?.push(
      MaterialPageRoute(
        builder: (_) => r.isGroup ? ConversationView.group(r.chat!, focusMessage: messageId) : ConversationView(other: r.user!, focusMessage: messageId),
      ),
    );
  }

  /// Navin group — members nivadun naav; banla ki thet tyacha chat.
  void newGroup() => navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => const NewGroupView()));

  /// Notification tap → tya person cha / group cha chat (aadhi ughda chat band karun).
  Future<void> openChatWith({String? from, String? chatId, String? messageId}) async {
    ChatRow? row;
    if (chatId != null) {
      final g = chats.where((c) => c.id == chatId).firstOrNull;
      row = ChatRow(
        null,
        g ?? ChatSummary(id: chatId, other: '', lastText: '', lastBy: '', lastAttachment: null, updatedAt: null, unread: false, isGroup: true),
      );
    } else if (from != null) {
      final list = users ?? await _repo.users();
      final u = list.where((x) => x.uid == from).firstOrNull;
      if (u != null) row = ChatRow(u, null);
    }
    if (row == null) return;
    homeTab.value = 0;
    navigatorKey.currentState?.popUntil((r) => r.isFirst);
    open(row, messageId: messageId);
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

class ChatsView extends StatelessWidget {
  const ChatsView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<ChatsViewModel>.reactive(
      viewModelBuilder: ChatsViewModel.new,
      onViewModelReady: (vm) => vm.init(),
      builder: (context, vm, _) {
        final rows = vm.visible;
        final loading = vm.users == null;
        return Scaffold(
          floatingActionButton: Rise(
            index: 3,
            child: FloatingActionButton.extended(
              onPressed: vm.newGroup,
              backgroundColor: Wa.accent,
              foregroundColor: Wa.accentFg,
              elevation: 2,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              icon: const Icon(Icons.group_add_rounded),
              label: const Text('New group', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
          body: RefreshIndicator(
            onRefresh: () => vm.load(fresh: true),
            edgeOffset: 120,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              slivers: [
                _Header(vm: vm),
                SliverToBoxAdapter(child: _SearchBar(onChanged: vm.search)),
                SliverToBoxAdapter(child: _Filters(vm: vm)),
                if (loading)
                  SliverList.builder(itemCount: 8, itemBuilder: (_, _) => const _SkeletonTile())
                else if (rows.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _Empty(
                      icon: switch (vm.filter) {
                        'unread' => Icons.mark_chat_read_outlined,
                        'groups' => Icons.groups_outlined,
                        _ => Icons.forum_outlined,
                      },
                      title: vm.message != null
                          ? "Couldn't load people"
                          : switch (vm.filter) {
                              'unread' => 'All caught up',
                              'groups' => 'No groups yet',
                              _ => 'No one found',
                            },
                      body:
                          vm.message ??
                          switch (vm.filter) {
                            'unread' => 'You have no unread messages.',
                            'groups' => 'Tap "New group" to create one.',
                            _ => 'Try a different name or email.',
                          },
                    ),
                  )
                else
                  SliverList.builder(
                    itemCount: rows.length,
                    itemBuilder: (context, i) => Rise(
                      key: ValueKey(rows[i].key),
                      index: i,
                      child: _ChatTile(row: rows[i], me: vm.me.uid, onTap: () => vm.open(rows[i])),
                    ),
                  ),
                // FAB khali shevatchi row lapu naye.
                const SliverToBoxAdapter(child: SafeArea(top: false, child: SizedBox(height: 88))),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Mothha "Chats" title — scroll kela ki lahan hoto ani var chiktun rahato.
class _Header extends StatelessWidget {
  const _Header({required this.vm});
  final ChatsViewModel vm;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return SliverAppBar(
      pinned: true,
      expandedHeight: 112,
      backgroundColor: Wa.bg(context),
      shape: const Border(),
      automaticallyImplyLeading: false,
      titleSpacing: 16,
      title: const Row(
        children: [
          Logo(size: 28),
          SizedBox(width: 10),
          Text('MultiSarv', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17, letterSpacing: -.2)),
        ],
      ),
      actions: [
        const ThemeToggle(),
        Padding(
          padding: const EdgeInsets.only(right: 12, left: 4),
          child: Pressable(
            onTap: () => homeTab.value = 4,
            child: Avatar(name: vm.me.name.isEmpty ? vm.me.email : vm.me.name, seed: vm.me.uid, radius: 17),
          ),
        ),
      ],
      flexibleSpace: LayoutBuilder(
        builder: (context, c) {
          // 1 = poorna ughda, 0 = collapse.
          final t = ((c.maxHeight - kToolbarHeight - top) / (112 - kToolbarHeight)).clamp(0.0, 1.0);
          return Stack(
            children: [
              Positioned(
                left: 16,
                bottom: 6,
                child: Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset(0, 8 * (1 - t)),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Chats',
                          style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -1, color: Wa.text(context)),
                        ),
                        if (vm.unread > 0) ...[const SizedBox(width: 10), Padding(padding: const EdgeInsets.only(bottom: 9), child: _CountPill(vm.unread))],
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Opacity(
                  opacity: 1 - t,
                  child: Divider(height: 1, color: Wa.border(context)),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CountPill extends StatelessWidget {
  const _CountPill(this.n);
  final int n;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    key: ValueKey(n),
    tween: Tween(begin: .6, end: 1),
    duration: const Duration(milliseconds: 400),
    curve: Curves.elasticOut,
    builder: (context, s, child) => Transform.scale(scale: s, child: child),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: Wa.accent.withValues(alpha: .12), borderRadius: BorderRadius.circular(20)),
      child: Text(
        '$n new',
        style: const TextStyle(color: Wa.accent, fontSize: 12, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

class _SearchBar extends StatefulWidget {
  const _SearchBar({required this.onChanged});
  final ValueChanged<String> onChanged;

  @override
  State<_SearchBar> createState() => _SearchBarState();
}

class _SearchBarState extends State<_SearchBar> {
  final _c = TextEditingController();
  final _f = FocusNode();

  @override
  void initState() {
    super.initState();
    _f.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _c.dispose();
    _f.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final focused = _f.hasFocus;
    final muted = Wa.muted(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 46,
        decoration: BoxDecoration(
          color: Wa.surface(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: focused ? Wa.accent : Wa.border(context), width: focused ? 1.5 : 1),
          boxShadow: focused ? [BoxShadow(color: Wa.accent.withValues(alpha: .15), blurRadius: 0, spreadRadius: 3)] : null,
        ),
        child: Row(
          children: [
            const SizedBox(width: 12),
            Icon(Icons.search_rounded, size: 20, color: focused ? Wa.accent : muted),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _c,
                focusNode: _f,
                onChanged: (v) {
                  widget.onChanged(v);
                  setState(() {});
                },
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(
                  hintText: 'Search people',
                  filled: false,
                  isDense: true,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 150),
              transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
              child: _c.text.isEmpty
                  ? const SizedBox(width: 12)
                  : IconButton(
                      icon: Icon(Icons.close_rounded, size: 18, color: muted),
                      onPressed: () {
                        _c.clear();
                        widget.onChanged('');
                        setState(() {});
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({required this.vm});
  final ChatsViewModel vm;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
    child: Row(
      children: [
        _Chip(label: 'All', selected: vm.filter == 'all', onTap: () => vm.setFilter('all')),
        const SizedBox(width: 8),
        _Chip(label: vm.unread > 0 ? 'Unread  ${vm.unread}' : 'Unread', selected: vm.filter == 'unread', onTap: () => vm.setFilter('unread')),
        const SizedBox(width: 8),
        _Chip(label: 'Groups', selected: vm.filter == 'groups', onTap: () => vm.setFilter('groups')),
      ],
    ),
  );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: .94,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: easeOutSoft,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: selected ? Wa.accent : Wa.surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: selected ? Wa.accent : Wa.border(context)),
      ),
      child: AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 220),
        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: selected ? Wa.accentFg : Wa.muted(context)),
        child: Text(label),
      ),
    ),
  );
}

class _ChatTile extends StatelessWidget {
  const _ChatTile({required this.row, required this.me, required this.onTap});
  final ChatRow row;
  final String me;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = row.chat;
    final unread = c?.unread ?? false;
    final muted = Wa.muted(context);
    final mineLast = c != null && c.lastBy == me;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              row.isGroup ? GroupAvatar(seed: c!.id, radius: 26, hero: true, photo: c.photo) : Avatar(name: row.title, seed: row.user!.uid, radius: 26, hero: true),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            row.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontWeight: unread ? FontWeight.w700 : FontWeight.w600, fontSize: 16, letterSpacing: -.2, color: Wa.text(context)),
                          ),
                        ),
                        if (c?.updatedAt != null)
                          Text(
                            listTime(c!.updatedAt!),
                            style: TextStyle(fontSize: 12, color: unread ? Wa.accent : muted, fontWeight: unread ? FontWeight.w700 : FontWeight.w500),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (mineLast && !c.lastSystem && !c.lastDeleted) ...[
                          // Kharech ✓ / ✓✓ / blue ✓✓ (shevatcha majha message).
                          Builder(
                            builder: (_) {
                              final r = c.lastReceipt(me);
                              return Icon(
                                r == Receipt.sent ? Icons.done_rounded : Icons.done_all_rounded,
                                size: 16,
                                color: r == Receipt.read ? const Color(0xFF38BDF8) : muted,
                              );
                            },
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            c == null
                                ? (row.user!.role ?? row.user!.email)
                                // Group: "Naav: message" (system / swatahcha sodun).
                                : (c.isGroup && !c.lastSystem && !mineLast && c.lastByName.isNotEmpty
                                      ? '${c.lastByName.split(' ').first}: ${c.preview}'
                                      : c.preview),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, color: unread ? Wa.text(context) : muted, fontWeight: unread ? FontWeight.w600 : FontWeight.w400),
                          ),
                        ),
                        // Notifications band (group) — web sarkha.
                        if (c != null && c.isGroup && c.notifyFor(me) == 'off') ...[
                          const SizedBox(width: 6),
                          Icon(Icons.notifications_off_outlined, size: 16, color: muted),
                        ],
                        // Mala mention.
                        if (c != null && c.mentioned)
                          Container(
                            margin: const EdgeInsets.only(left: 6),
                            width: 20,
                            height: 20,
                            decoration: const BoxDecoration(color: Wa.accent, shape: BoxShape.circle),
                            child: const Icon(Icons.alternate_email_rounded, size: 13, color: Colors.white),
                          ),
                        // Na vachlele — kiti (WhatsApp sarkha). Notifications band asel tar fikat.
                        AnimatedScale(
                          scale: unread ? 1 : 0,
                          duration: const Duration(milliseconds: 350),
                          curve: unread ? Curves.elasticOut : Curves.easeIn,
                          child: Container(
                            margin: const EdgeInsets.only(left: 6),
                            constraints: const BoxConstraints(minWidth: 20),
                            height: 20,
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: c != null && c.isGroup && c.notifyFor(me) == 'off' ? muted.withValues(alpha: .45) : Wa.accent,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              (c?.unreadCount ?? 0) > 99 ? '99+' : '${c?.unreadCount ?? 0}',
                              style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SkeletonTile extends StatelessWidget {
  const _SkeletonTile();

  @override
  Widget build(BuildContext context) => const Shimmer(
    child: Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Bone(width: 52, height: 52, radius: 26),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [Bone(width: 130, height: 14), Spacer(), Bone(width: 40, height: 10)]),
                SizedBox(height: 10),
                Bone(width: 200, height: 11),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(32, 48, 32, 48),
    child: Rise(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Float(
            child: Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [Wa.logoFrom.withValues(alpha: .15), Wa.logoTo.withValues(alpha: .15)]),
              ),
              child: Icon(icon, size: 34, color: Wa.accent),
            ),
          ),
          const SizedBox(height: 18),
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
    ),
  );
}

/// Aaj → vel, kal → Yesterday, ya athvadyat → var, nahi tar tarikh (WhatsApp sarkha).
String listTime(DateTime d) {
  final now = DateTime.now();
  final day = DateTime(d.year, d.month, d.day);
  final today = DateTime(now.year, now.month, now.day);
  final diff = today.difference(day).inDays;
  if (diff == 0) return DateFormat.jm().format(d);
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return DateFormat.EEEE().format(d);
  return DateFormat('dd/MM/yy').format(d);
}
