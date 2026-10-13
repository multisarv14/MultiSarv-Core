import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:stacked/stacked.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/chat_repository.dart';
import '../../data/call_repository.dart';
import '../../data/models.dart';
import '../../services/call_service.dart';
import '../../services/push_service.dart';
import '../../services/session_service.dart';
import 'widgets/avatar.dart';
import 'widgets/bubble.dart';
import 'widgets/composer.dart';
import 'widgets/mentions.dart';
import 'widgets/message_sheets.dart';
import '../groups/group_info_view.dart';

class ConversationViewModel extends BaseViewModel with WidgetsBindingObserver {
  ConversationViewModel({this.other, this.group});

  /// 1:1 — samorcha user. Group asel tar null.
  final ChatUser? other;

  /// Group — live (naav / members badalle ki).
  ChatSummary? group;

  final _repo = locator<ChatRepository>();
  final _push = locator<PushService>();
  final String me = locator<SessionService>().me.uid;

  bool get isGroup => other == null;
  late final String chatId = isGroup ? group!.id : chatIdOf(me, other!.uid);
  List<ChatMessage>? messages;
  ChatMessage? reply;
  StreamSubscription<List<ChatMessage>>? _sub;
  StreamSubscription<ChatSummary?>? _chatSub;
  String? _lastSeen;

  /// 1:1 chat doc live (✓✓ watermark juna messages sathi). Group la [group].
  ChatSummary? _direct;
  ChatSummary? get chatDoc => isGroup ? group : _direct;

  /// `@mention` — group che (mi sodun, naav asnare) members, naav kramane.
  List<MentionMember> get mentionMembers {
    final g = group;
    if (!isGroup || g == null || removed) return const [];
    return [
      for (final u in g.members)
        if (u != me && (g.names[u] ?? '').isNotEmpty) MentionMember(u, g.names[u]!),
    ]..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
  }

  /// ✓ / ✓✓ / blue ✓✓ — majhya message sathi.
  Receipt receiptOf(ChatMessage m) => m.receipt(chatDoc, chatDoc?.members.isNotEmpty == true ? chatDoc!.members : [me, if (other != null) other!.uid]);

  /// "Read" fakt app samor (foreground) ani ha chat screen var asel tar.
  void _markIfViewing() {
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) return;
    _repo.markRead(chatId).catchError((Object _) {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // App parat samor — madhe aalele messages ata vachle.
    final last = messages?.isEmpty ?? true ? null : messages!.last;
    if (state == AppLifecycleState.resumed && last != null && last.by != me) _markIfViewing();
  }

  /// Group madhun kadhla / sodla — pathavta yet nahi.
  bool get removed => isGroup && group != null && group!.members.isNotEmpty && !group!.members.contains(me);

  String get title => isGroup ? (group!.name.isEmpty ? 'Group' : group!.name) : other!.label;

  /// Group: "You, Ram, Shyam"; 1:1: role / email.
  String get subtitle {
    if (!isGroup) return other!.role ?? other!.email;
    final g = group!;
    if (g.members.isEmpty) return 'Tap for group info';
    final names = [
      if (g.members.contains(me)) 'You',
      ...g.members.where((m) => m != me).map((m) => (g.names[m] ?? '').split(' ').first).where((n) => n.isNotEmpty),
    ];
    return names.join(', ');
  }

  void init() {
    // Ha chat ughda — tyache foreground alerts nako.
    _push.openChatId = chatId;
    WidgetsBinding.instance.addObserver(this);
    _chatSub = _repo.chat(chatId, me).listen((g) {
      if (g == null) return;
      if (isGroup) {
        group = g;
      } else {
        _direct = g;
      }
      notifyListeners();
    }, onError: (Object _) {});
    _subscribe();
  }

  /// Ekda kiti messages — "Load earlier" ne +300.
  int limit = 300;
  bool get hasMore => (messages?.length ?? 0) >= limit;

  void loadMore() {
    limit += 300;
    _subscribe();
  }

  void _subscribe() {
    _sub?.cancel();
    _sub = _repo
        .messages(chatId, me, limit: limit)
        .listen(
          (m) {
            messages = m;
            notifyListeners();
            // Dusryacha navin message → "vachla" (swatahche pathavlyavar call nako).
            final last = m.isEmpty ? null : m.last;
            if (last != null && last.id != _lastSeen) {
              _lastSeen = last.id;
              if (last.by != me) _markIfViewing();
            }
          },
          onError: (Object _) {
            messages ??= const [];
            notifyListeners();
          },
        );
  }

  // ── Select (WhatsApp sarkha) ──
  final selected = <String>{};
  bool get selecting => selected.isNotEmpty;
  void toggleSelect(String id) {
    selected.contains(id) ? selected.remove(id) : selected.add(id);
    notifyListeners();
  }

  void clearSelection() {
    selected.clear();
    notifyListeners();
  }

  /// Nivadlele (kramane), system / call sodun.
  List<ChatMessage> get picked => (messages ?? const <ChatMessage>[]).where((m) => selected.contains(m.id) && !m.system && m.call == null).toList();

  /// Group setting — fakt admins pathavu shaktat.
  bool get blocked => isGroup && group != null && group!.onlyAdminsSend && !group!.admins.contains(me);

  Future<String?> react(ChatMessage m, String? emoji) => _try(() => _repo.react(chatId, m.id, emoji));

  Future<String?> star(List<ChatMessage> list, bool starred) =>
      _try(() => _repo.star(chatId, list.where((m) => !m.deleted).map((m) => m.id).toList(), starred), starred ? 'Starred' : 'Star removed');

  Future<String?> deleteMany(List<ChatMessage> list, {required bool forEveryone}) => _try(() async {
    for (final m in list) {
      await _repo.deleteMessage(chatId, m.id, forEveryone: forEveryone);
    }
  });

  /// null = zala (kinva `done` message); nahi tar error text.
  Future<String?> _try(Future<void> Function() job, [String? done]) async {
    try {
      await job();
      return done;
    } catch (e) {
      return errorText(e);
    }
  }

  void setReply(ChatMessage? m) {
    reply = m;
    notifyListeners();
  }

  /// null = gela; nahi tar error text (composer text / file parat theto).
  Future<String?> send(Outgoing o) async {
    try {
      await _repo.send(
        me: me,
        to: other?.uid,
        groupId: isGroup ? chatId : null,
        text: o.text,
        file: o.file,
        fileName: o.fileName,
        duration: o.duration,
        replyTo: reply?.id,
        mentions: isGroup ? o.mentions : const [],
      );
      setReply(null);
      return null;
    } catch (e) {
      return errorText(e);
    }
  }

  /// null = zala; nahi tar error text.
  Future<String?> delete(ChatMessage m, {required bool forEveryone}) async {
    try {
      if (reply?.id == m.id) setReply(null);
      await _repo.deleteMessage(chatId, m.id, forEveryone: forEveryone);
      return null;
    } catch (e) {
      return errorText(e);
    }
  }

  @override
  void dispose() {
    if (_push.openChatId == chatId) _push.openChatId = null;
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    _chatSub?.cancel();
    super.dispose();
  }
}

class ConversationView extends StatefulWidget {
  const ConversationView({super.key, required ChatUser this.other, this.focusMessage}) : group = null;
  const ConversationView.group(ChatSummary this.group, {super.key, this.focusMessage}) : other = null;
  final ChatUser? other;
  final ChatSummary? group;

  /// Notification (mention / reply) varun — ughadlyavar ha message dakhva.
  final String? focusMessage;

  @override
  State<ConversationView> createState() => _ConversationViewState();
}

class _ConversationViewState extends State<ConversationView> {
  final _keys = <String, GlobalKey>{};
  final _scroll = ScrollController();
  String? _flash;
  bool _away = false;

  /// Screen ughdla tevha aslele messages — tyanna animation nako, fakt navin la.
  Set<String>? _known;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final away = _scroll.offset > 400;
      if (away != _away) setState(() => _away = away);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  bool _focused = false;

  /// Notification cha message — list lazy ahe, mhanun adhi andaje scroll mag `_jump` (kahi vela).
  void _focusMessage(List<ChatMessage> msgs, String id, [int tries = 0]) {
    if (!mounted) return;
    if (_keys[id]?.currentContext != null) return _jump(id);
    final idx = msgs.indexWhere((m) => m.id == id);
    if (idx < 0 || tries > 8 || !_scroll.hasClients) return;
    // reverse list: shevatcha message = offset 0.
    final fromEnd = msgs.length - 1 - idx;
    final target = (fromEnd * 72.0).clamp(0.0, _scroll.position.maxScrollExtent);
    _scroll.jumpTo(target);
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusMessage(msgs, id, tries + 1));
  }

  /// Quote var tap — mool message kade (screen javal asel tar).
  void _jump(String id) {
    final ctx = _keys[id]?.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(ctx, alignment: .5, duration: const Duration(milliseconds: 300), curve: easeOutSoft);
    setState(() => _flash = id);
    Future.delayed(const Duration(milliseconds: 1200), () => mounted ? setState(() => _flash = null) : null);
  }

  void _call(CallType type) {
    final o = widget.other;
    if (o == null) return;
    _toast(locator<CallService>().startCall(o.uid, o.label, type));
  }

  /// Group info — tithun "Search messages" kinva starred / media var tap → ithe.
  Future<void> _groupInfo(ConversationViewModel vm) async {
    final r = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => GroupInfoView(chatId: vm.chatId)));
    if (r == null || !mounted) return;
    if (r == 'search') return _search(vm);
    final msgs = vm.messages;
    if (r.startsWith('jump:') && msgs != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _focusMessage(msgs, r.substring(5)));
    }
  }

  // ── Message actions (web sarkhe) ──

  Map<String, String> _names(ConversationViewModel vm) => vm.isGroup
      ? (vm.group?.names ?? const {})
      : {vm.me: 'You', if (widget.other != null) widget.other!.uid: widget.other!.label};

  Future<void> _onAction(ConversationViewModel vm, ChatMessage m, MsgAction a) async {
    switch (a) {
      case MsgAction.forward:
        if (await showForwardSheet(context, chatId: vm.chatId, me: vm.me, ids: [m.id])) vm.clearSelection();
      case MsgAction.star:
        _toast(await vm.star([m], !m.starred));
      case MsgAction.select:
        vm.toggleSelect(m.id);
      case MsgAction.share:
        await _share(vm, m);
      case MsgAction.info:
        showMessageInfo(context, m: m, chat: vm.chatDoc, names: _names(vm));
      case MsgAction.reactions:
        showReactions(context, m: m, me: vm.me, names: _names(vm), onReact: (e) async => _toast(await vm.react(m, e)));
    }
  }

  /// Text kinva file (phone cha share sheet — WhatsApp / mail / …).
  Future<void> _share(ConversationViewModel vm, ChatMessage m) async {
    try {
      final a = m.attachment;
      if (a != null) {
        final url = await locator<ChatRepository>().attachmentUrl(a.path);
        final dir = await getTemporaryDirectory();
        final file = File('${dir.path}/${a.name.replaceAll(RegExp(r'[^\w.\- ]'), '_')}');
        final req = await HttpClient().getUrl(Uri.parse(url));
        final res = await req.close();
        await res.pipe(file.openWrite());
        await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: a.type)], text: m.text.isEmpty ? null : m.text));
      } else {
        await SharePlus.instance.share(ShareParams(text: m.text));
      }
    } catch (_) {
      _toast("Couldn't share");
    }
  }

  Future<void> _search(ConversationViewModel vm) async {
    final msgs = vm.messages;
    if (msgs == null) return;
    final id = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => ChatSearchView(messages: msgs, me: vm.me, names: _names(vm))),
    );
    if (id == null || !mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _focusMessage(msgs, id));
  }

  /// Select mode — WhatsApp sarkha var count + actions.
  PreferredSizeWidget _selectionBar(ConversationViewModel vm) {
    final picked = vm.picked;
    final allStarred = picked.isNotEmpty && picked.every((m) => m.starred);
    final live = picked.where((m) => !m.deleted).toList();
    return AppBar(
      backgroundColor: Wa.surface(context),
      leading: IconButton(icon: const Icon(Icons.close_rounded), onPressed: vm.clearSelection),
      title: Text('${vm.selected.length} selected', style: const TextStyle(fontWeight: FontWeight.w700)),
      actions: [
        IconButton(
          tooltip: 'Copy',
          icon: const Icon(Icons.copy_rounded),
          onPressed: live.every((m) => m.text.isEmpty)
              ? null
              : () {
                  final text = live.length == 1
                      ? live.first.text
                      : live.map((m) => '[${m.at == null ? '' : DateFormat('d MMM, h:mm a').format(m.at!)}] ${m.by == vm.me ? 'You' : m.byName}: ${m.text}').join('\n');
                  Clipboard.setData(ClipboardData(text: text));
                  vm.clearSelection();
                  _toast('Copied');
                },
        ),
        IconButton(
          tooltip: allStarred ? 'Unstar' : 'Star',
          icon: Icon(allStarred ? Icons.star_outline_rounded : Icons.star_rounded),
          onPressed: live.isEmpty
              ? null
              : () async {
                  _toast(await vm.star(live, !allStarred));
                  vm.clearSelection();
                },
        ),
        IconButton(
          tooltip: 'Forward',
          icon: const Icon(Icons.shortcut_rounded),
          onPressed: live.isEmpty
              ? null
              : () async {
                  if (live.length > 10) return _toast('You can forward up to 10 messages at a time.');
                  if (await showForwardSheet(context, chatId: vm.chatId, me: vm.me, ids: live.map((m) => m.id).toList())) vm.clearSelection();
                },
        ),
        IconButton(
          tooltip: 'Delete',
          icon: const Icon(Icons.delete_outline_rounded),
          onPressed: picked.isEmpty ? null : () => _deleteSelected(vm, picked),
        ),
      ],
    );
  }

  Future<void> _deleteSelected(ConversationViewModel vm, List<ChatMessage> picked) async {
    final everyone = picked.every((m) => m.by == vm.me && !m.deleted);
    final choice = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete ${picked.length} message${picked.length == 1 ? '' : 's'}?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Delete for me')),
          if (everyone)
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Delete for everyone'),
            ),
        ],
      ),
    );
    if (choice == null) return;
    _toast(await vm.deleteMany(picked, forEveryone: choice));
    vm.clearSelection();
  }

  void _toBottom() => _scroll.animateTo(0, duration: const Duration(milliseconds: 450), curve: easeOutSoft);

  void _toast(String? msg) {
    if (msg != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<ConversationViewModel>.reactive(
      viewModelBuilder: () => ConversationViewModel(other: widget.other, group: widget.group),
      onViewModelReady: (vm) => vm.init(),
      builder: (context, vm, _) {
        final msgs = vm.messages;
        if (msgs != null) _known ??= {for (final m in msgs) m.id};
        final focus = widget.focusMessage;
        if (msgs != null && focus != null && !_focused) {
          _focused = true;
          WidgetsBinding.instance.addPostFrameCallback((_) => _focusMessage(msgs, focus));
        }
        return Scaffold(
          backgroundColor: Wa.chatBg(context),
          appBar: vm.selecting
              ? _selectionBar(vm)
              : AppBar(
            titleSpacing: 0,
            backgroundColor: Wa.surface(context),
            title: GestureDetector(
              behavior: HitTestBehavior.opaque,
              // Group → info (members, naav, leave).
              onTap: vm.isGroup ? () => _groupInfo(vm) : null,
              child: Row(
                children: [
                  vm.isGroup ? GroupAvatar(seed: vm.chatId, radius: 19, hero: true, photo: vm.group?.photo) : Avatar(name: vm.title, seed: widget.other!.uid, radius: 19, hero: true),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          vm.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 16.5, fontWeight: FontWeight.w700, letterSpacing: -.2),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          vm.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: Wa.muted(context)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              // 1:1 — voice / video call (group madhe nahi).
              if (!vm.isGroup) ...[
                IconButton(tooltip: 'Video call', icon: const Icon(Icons.videocam_rounded), onPressed: () => _call(CallType.video)),
                IconButton(tooltip: 'Voice call', icon: const Icon(Icons.call_rounded), onPressed: () => _call(CallType.audio)),
              ],
              IconButton(tooltip: 'Search', icon: const Icon(Icons.search_rounded), onPressed: () => _search(vm)),
              const SizedBox(width: 4),
            ],
          ),
          body: Column(
            children: [
              Expanded(
                child: Stack(
                  children: [
                    const Positioned.fill(child: _DotPattern()),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      child: msgs == null
                          ? const _SkeletonThread()
                          : msgs.isEmpty
                          ? _EmptyThread(
                              name: vm.title,
                              onWave: () => vm.send(const Outgoing(text: '👋')),
                            )
                          : ListView.builder(
                              key: const ValueKey('list'),
                              controller: _scroll,
                              // reverse: navin khali, keyboard ughadla tari shevatcha message disto.
                              reverse: true,
                              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                              itemCount: msgs.length + (vm.hasMore ? 1 : 0),
                              itemBuilder: (context, i) {
                                // Sarvat var — juna messages.
                                if (i == msgs.length) {
                                  return Center(
                                    child: TextButton.icon(onPressed: vm.loadMore, icon: const Icon(Icons.history_rounded, size: 18), label: const Text('Load earlier messages')),
                                  );
                                }
                                final idx = msgs.length - 1 - i;
                                final m = msgs[idx];
                                final prev = idx > 0 ? msgs[idx - 1] : null;
                                final newDay = prev == null || !_sameDay(prev.at, m.at);
                                final first = newDay || prev.by != m.by || prev.system;
                                return Column(
                                  key: _keys.putIfAbsent(m.id, GlobalKey.new),
                                  children: [
                                    if (newDay) _DayChip(m.at),
                                    if (m.system)
                                      _SystemNote(m.text)
                                    else if (m.call != null)
                                      _CallEntry(m: m, mine: m.by == vm.me, onCallBack: vm.isGroup ? null : _call)
                                    else
                                      Bubble(
                                        m: m,
                                        me: vm.me,
                                        mine: m.by == vm.me,
                                        // Ekach mansache saglag messages — gol kopre fakt pahilyala.
                                        first: first,
                                        // Group: dusryachya message var pathavnaryache naav.
                                        sender: vm.isGroup && first && m.by != vm.me ? m.byName : null,
                                        highlight: _flash == m.id,
                                        receipt: m.by == vm.me ? vm.receiptOf(m) : null,
                                        names: vm.group?.names ?? const {},
                                        animate: !(_known?.contains(m.id) ?? true),
                                        onReply: () => vm.setReply(m),
                                        onJump: _jump,
                                        onDelete: (all) async => _toast(await vm.delete(m, forEveryone: all)),
                                        onReact: (e) async => _toast(await vm.react(m, e)),
                                        onAction: (a) => _onAction(vm, m, a),
                                        selecting: vm.selecting,
                                        selected: vm.selected.contains(m.id),
                                        onToggleSelect: () => vm.toggleSelect(m.id),
                                      ),
                                  ],
                                );
                              },
                            ),
                    ),
                    Positioned(
                      right: 14,
                      bottom: 12,
                      child: AnimatedScale(
                        scale: _away ? 1 : 0,
                        duration: const Duration(milliseconds: 250),
                        curve: _away ? Curves.easeOutBack : Curves.easeIn,
                        child: Pressable(
                          onTap: _toBottom,
                          child: Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: Wa.surface(context),
                              shape: BoxShape.circle,
                              border: Border.all(color: Wa.border(context)),
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .12), blurRadius: 12, offset: const Offset(0, 4))],
                            ),
                            child: Icon(Icons.keyboard_arrow_down_rounded, color: Wa.text(context)),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              if (vm.removed)
                const _Removed()
              else if (vm.blocked)
                const _Notice('Only admins can send messages in this group.')
              else
                Composer(
                  me: vm.me,
                  members: vm.mentionMembers,
                  reply: vm.reply,
                  onCancelReply: () => vm.setReply(null),
                  onSend: (o) {
                    if (_scroll.hasClients && _scroll.offset > 0) _toBottom();
                    return vm.send(o);
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}

bool _sameDay(DateTime? a, DateTime? b) => a != null && b != null && a.year == b.year && a.month == b.month && a.day == b.day;

class _DayChip extends StatelessWidget {
  const _DayChip(this.at);
  final DateTime? at;

  @override
  Widget build(BuildContext context) {
    final d = at ?? DateTime.now();
    final now = DateTime.now();
    final days = DateTime(now.year, now.month, now.day).difference(DateTime(d.year, d.month, d.day)).inDays;
    final label = days == 0 ? 'Today' : (days == 1 ? 'Yesterday' : (days < 7 ? DateFormat.EEEE().format(d) : DateFormat('d MMM y').format(d)));
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: Wa.surface(context).withValues(alpha: .92),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Wa.border(context)),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Wa.muted(context), letterSpacing: .2),
        ),
      ),
    );
  }
}

/// Group madhla "X ne group banavla" — madhyabhagi chhota chip.
class _SystemNote extends StatelessWidget {
  const _SystemNote(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 24),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: Wa.accent.withValues(alpha: .08), borderRadius: BorderRadius.circular(12)),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: Wa.muted(context), height: 1.35),
      ),
    ),
  );
}

/// Group madhun kadhla — composer aivaji.
class _Removed extends StatelessWidget {
  const _Removed();

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    decoration: BoxDecoration(
      color: Wa.surface(context),
      border: Border(top: BorderSide(color: Wa.border(context))),
    ),
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Text(
          "You can't send messages to this group because you're no longer a member.",
          textAlign: TextAlign.center,
          style: TextStyle(color: Wa.muted(context), fontSize: 13),
        ),
      ),
    ),
  );
}

/// Halke thipke — chat background la texture (web `.bg-grid` sarkha halka).
class _DotPattern extends StatelessWidget {
  const _DotPattern();

  @override
  Widget build(BuildContext context) => CustomPaint(painter: _Dots(Wa.text(context).withValues(alpha: .045)));
}

class _Dots extends CustomPainter {
  _Dots(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color;
    const gap = 22.0;
    for (var y = gap / 2; y < size.height; y += gap) {
      for (var x = gap / 2; x < size.width; x += gap) {
        canvas.drawCircle(Offset(x, y), 1.1, p);
      }
    }
  }

  @override
  bool shouldRepaint(_Dots old) => old.color != color;
}

class _SkeletonThread extends StatelessWidget {
  const _SkeletonThread();

  @override
  Widget build(BuildContext context) {
    const widths = [180.0, 120.0, 220.0, 90.0, 160.0, 200.0];
    return Shimmer(
      child: ListView.builder(
        reverse: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(14),
        itemCount: widths.length,
        itemBuilder: (_, i) => Align(
          alignment: i.isEven ? Alignment.centerRight : Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Bone(width: widths[i], height: 40, radius: 18),
          ),
        ),
      ),
    );
  }
}

class _EmptyThread extends StatelessWidget {
  const _EmptyThread({required this.name, required this.onWave});
  final String name;
  final VoidCallback onWave;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Rise(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const _Wave(),
            const SizedBox(height: 16),
            Text(
              'Start the conversation',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: Wa.text(context)),
            ),
            const SizedBox(height: 6),
            Text(
              'Messages with $name will appear here.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Wa.muted(context)),
            ),
            const SizedBox(height: 18),
            Pressable(
              onTap: onWave,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                decoration: BoxDecoration(
                  color: Wa.accent.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Wa.accent.withValues(alpha: .25)),
                ),
                child: const Text(
                  'Say hi 👋',
                  style: TextStyle(color: Wa.accent, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// 👋 halnara haat (web `.animate-wave`).
class _Wave extends StatefulWidget {
  const _Wave();

  @override
  State<_Wave> createState() => _WaveState();
}

class _WaveState extends State<_Wave> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (context, child) {
      final t = _c.value;
      // Pahilya 60% madhe halto, mag thamba.
      final a = t < .6 ? math.sin(t / .6 * math.pi * 4) * .25 * (1 - t / .6) : 0.0;
      return Transform.rotate(angle: a, alignment: const Alignment(.4, .4), child: child);
    },
    child: const Text('👋', style: TextStyle(fontSize: 56)),
  );
}

/// Composer → pathvaycha message.
class Outgoing {
  const Outgoing({required this.text, this.file, this.fileName, this.duration, this.mentions = const []});
  final String text;

  /// Group — `@` kelele members (uid).
  final List<String> mentions;
  final File? file;
  final String? fileName;
  final int? duration;
}

/// Call history — web sarkha: "Voice call · 3:12", lal "Missed voice call", parat call button.
class _CallEntry extends StatelessWidget {
  const _CallEntry({required this.m, required this.mine, this.onCallBack});
  final ChatMessage m;
  final bool mine;
  final void Function(CallType)? onCallBack;

  @override
  Widget build(BuildContext context) {
    final c = m.call!;
    final video = c.type == 'video';
    final missed = !mine && (c.outcome == 'missed' || c.outcome == 'cancelled');
    final label = switch (c.outcome) {
      'completed' => video ? 'Video call' : 'Voice call',
      'declined' => 'Declined',
      'busy' => 'Busy',
      'failed' => 'Call failed',
      _ => missed ? (video ? 'Missed video call' : 'Missed voice call') : 'No answer',
    };
    final fg = mine ? Wa.accentFg : Wa.text(context);
    final sub = mine ? Wa.accentFg.withValues(alpha: .75) : Wa.muted(context);
    final time = m.at == null ? '' : DateFormat.jm().format(m.at!);
    final dur = c.outcome == 'completed' && c.duration > 0 ? ' · ${c.duration ~/ 60}:${(c.duration % 60).toString().padLeft(2, '0')}' : '';
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(10, 8, 6, 8),
        decoration: BoxDecoration(
          color: mine ? Wa.accent : Wa.theirs(context),
          borderRadius: BorderRadius.circular(16),
          border: mine ? null : Border.all(color: Wa.border(context)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 17,
              backgroundColor: mine ? Colors.white24 : (missed ? Colors.red.withValues(alpha: .12) : Wa.accent.withValues(alpha: .12)),
              child: Icon(
                video ? Icons.videocam_rounded : (missed ? Icons.call_missed_rounded : (mine ? Icons.call_made_rounded : Icons.call_received_rounded)),
                size: 18,
                color: mine ? Colors.white : (missed ? Colors.red : Wa.accent),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5, color: missed ? Colors.red : fg)),
                Text('$time$dur', style: TextStyle(fontSize: 11.5, color: sub)),
              ],
            ),
            if (onCallBack != null)
              IconButton(
                tooltip: 'Call back',
                icon: Icon(video ? Icons.videocam_rounded : Icons.call_rounded, size: 20, color: mine ? Colors.white : Wa.accent),
                onPressed: () => onCallBack!(video ? CallType.video : CallType.audio),
              ),
          ],
        ),
      ),
    );
  }
}

/// Composer chya jagi — group settings mule pathavta yet nahi.
class _Notice extends StatelessWidget {
  const _Notice(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
    decoration: BoxDecoration(
      color: Wa.surface(context),
      border: Border(top: BorderSide(color: Wa.border(context))),
    ),
    child: SafeArea(
      top: false,
      child: Text(text, textAlign: TextAlign.center, style: TextStyle(color: Wa.muted(context))),
    ),
  );
}
