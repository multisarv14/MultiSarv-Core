import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../app/locator.dart';
import '../../../app/motion.dart';
import '../../../app/theme.dart';
import '../../../core/backend.dart';
import '../../../data/chat_repository.dart';
import '../../../data/models.dart';
import 'media_viewer.dart';
import 'mentions.dart';
import 'voice_note.dart';

/// Long-press menu che actions (web sarkhe) — screen (conversation) karto.
enum MsgAction { forward, star, select, share, info, reactions }

/// WhatsApp sarkhe jhatpat reactions.
const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

final _urlRe = RegExp(r'''\b(?:https?://|www\.)[^\s<>"']+''', caseSensitive: false);

/// Text madhle links (Group info → Links).
List<String> linksIn(String text) => _urlRe.allMatches(text).map((m) => m.group(0)!.replaceAll(RegExp(r'[.,;:!?)\]}]+$'), '')).toList();

String fileSize(int n) => n < 1024 * 1024 ? '${(n / 1024).round().clamp(1, 1024)} KB' : '${(n / 1024 / 1024).toStringAsFixed(1)} MB';

/// WhatsApp sarkha message: ujvikade swipe = reply, long press = Reply / Copy.
class Bubble extends StatefulWidget {
  const Bubble({
    super.key,
    required this.m,
    required this.me,
    required this.mine,
    required this.first,
    required this.highlight,
    this.animate = false,
    this.sender,
    required this.onReply,
    required this.onJump,
    required this.onDelete,
    this.receipt,
    this.names = const {},
    this.onAction,
    this.onReact,
    this.selecting = false,
    this.selected = false,
    this.onToggleSelect,
  });

  /// Forward / star / select / share / info / reactions.
  final void Function(MsgAction a)? onAction;

  /// `null` = majhi reaction kadha.
  final void Function(String? emoji)? onReact;

  /// Select mode — tap = nivad / kadha.
  final bool selecting;
  final bool selected;
  final VoidCallback? onToggleSelect;

  /// Group — uid → naav (`@mention` highlight).
  final Map<String, String> names;

  final ChatMessage m;

  /// Majha message — ✓ / ✓✓ / blue ✓✓.
  final Receipt? receipt;
  final String me;
  final bool mine;
  final bool first;
  final bool highlight;

  /// Screen ughdlyavar aalela navin message — pop-in animation.
  final bool animate;
  final VoidCallback onReply;
  final void Function(String id) onJump;

  /// Group: dusryachya message var naav (run cha pahila).
  final String? sender;

  /// true = sagळ्यांसाठी, false = fakt majhyasathi.
  final void Function(bool forEveryone) onDelete;

  @override
  State<Bubble> createState() => _BubbleState();
}

class _BubbleState extends State<Bubble> {
  double _dx = 0;
  bool _armed = false;

  void _menu() {
    if (widget.selecting) return;
    HapticFeedback.selectionClick();
    final m = widget.m;
    final mine = m.reactions[widget.me];
    void act(BuildContext ctx, VoidCallback f) {
      Navigator.pop(ctx);
      f();
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Jhatpat reactions (WhatsApp sarkhe) — parat tech = kadha.
              if (!m.deleted && widget.onReact != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (final e in quickReactions)
                        InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () => act(ctx, () => widget.onReact!(mine == e ? null : e)),
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(shape: BoxShape.circle, color: mine == e ? Wa.accent.withValues(alpha: .15) : null),
                            child: Text(e, style: const TextStyle(fontSize: 26)),
                          ),
                        ),
                    ],
                  ),
                ),
              if (!m.deleted)
                _MenuItem(icon: Icons.reply_rounded, label: 'Reply', onTap: () => act(ctx, widget.onReply)),
              if (!m.deleted && m.text.isNotEmpty)
                _MenuItem(
                  icon: Icons.copy_rounded,
                  label: 'Copy',
                  onTap: () => act(ctx, () {
                    Clipboard.setData(ClipboardData(text: m.text));
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Message copied')));
                  }),
                ),
              if (!m.deleted && widget.onAction != null) ...[
                _MenuItem(icon: Icons.shortcut_rounded, label: 'Forward', onTap: () => act(ctx, () => widget.onAction!(MsgAction.forward))),
                _MenuItem(
                  icon: m.starred ? Icons.star_outline_rounded : Icons.star_rounded,
                  label: m.starred ? 'Unstar' : 'Star',
                  onTap: () => act(ctx, () => widget.onAction!(MsgAction.star)),
                ),
                _MenuItem(icon: Icons.share_rounded, label: 'Share', onTap: () => act(ctx, () => widget.onAction!(MsgAction.share))),
                if (widget.mine) _MenuItem(icon: Icons.info_outline_rounded, label: 'Info', onTap: () => act(ctx, () => widget.onAction!(MsgAction.info))),
              ],
              if (widget.onAction != null)
                _MenuItem(icon: Icons.check_circle_outline_rounded, label: 'Select', onTap: () => act(ctx, () => widget.onAction!(MsgAction.select))),
              _MenuItem(
                icon: Icons.delete_outline_rounded,
                label: 'Delete',
                danger: true,
                onTap: () => act(ctx, _confirmDelete),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Text — `@mention` highlight ani links (tap → browser).
  final _taps = <TapGestureRecognizer>[];
  List<InlineSpan> _rich(String text, TextStyle highlight, TextStyle link) {
    for (final t in _taps) {
      t.dispose();
    }
    _taps.clear();
    final names = widget.m.mentions.map((u) => widget.names[u] ?? '');
    final out = <InlineSpan>[];
    var last = 0;
    for (final match in _urlRe.allMatches(text)) {
      final url = match.group(0)!.replaceAll(RegExp(r'[.,;:!?)\]}]+$'), '');
      if (match.start > last) out.addAll(mentionSpans(text.substring(last, match.start), names, highlight: highlight));
      final tap = TapGestureRecognizer()
        ..onTap = () => launchUrl(Uri.parse(url.startsWith('http') ? url : 'https://$url'), mode: LaunchMode.externalApplication);
      _taps.add(tap);
      out.add(TextSpan(text: url, style: link, recognizer: tap));
      last = match.start + url.length;
    }
    if (last < text.length) out.addAll(mentionSpans(text.substring(last), names, highlight: highlight));
    return out;
  }

  @override
  void dispose() {
    for (final t in _taps) {
      t.dispose();
    }
    super.dispose();
  }

  /// WhatsApp sarkha: swatahcha → "for everyone" / "for me"; dusryacha → fakt "for me".
  Future<void> _confirmDelete() async {
    final canAll = widget.mine && !widget.m.deleted;
    final choice = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final red = Theme.of(ctx).colorScheme.error;
        return AlertDialog(
          title: const Text('Delete message?'),
          content: Text(canAll ? 'Delete for everyone removes it (and any attachment) for all members.' : 'It will be removed only from your phone.'),
          actionsOverflowDirection: VerticalDirection.down,
          actionsOverflowButtonSpacing: 4,
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Delete for me', style: TextStyle(color: red)),
            ),
            if (canAll)
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: red),
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Delete for everyone'),
              ),
          ],
        );
      },
    );
    if (choice != null) {
      HapticFeedback.mediumImpact();
      widget.onDelete(choice);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.m;
    final mine = widget.mine;
    final a = m.attachment;
    // Group: pahila / shevatcha message — kopre tyanusar (web `rounded-2xl` + `rounded-br-sm`).
    const big = Radius.circular(18);
    const small = Radius.circular(5);
    final radius = BorderRadius.only(
      topLeft: !mine && !widget.first ? small : big,
      topRight: mine && !widget.first ? small : big,
      bottomLeft: !mine ? small : big,
      bottomRight: mine ? small : big,
    );
    final timeColor = mine ? Wa.accentFg.withValues(alpha: .75) : Wa.muted(context);
    final r = widget.receipt;
    final time = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (m.starred) ...[Icon(Icons.star_rounded, size: 12, color: timeColor), const SizedBox(width: 2)],
        Text(m.at == null ? '' : DateFormat.jm().format(m.at!), style: TextStyle(fontSize: 10.5, color: timeColor)),
        if (r != null && !m.deleted) ...[
          const SizedBox(width: 3),
          Icon(
            r == Receipt.sent ? Icons.done_rounded : Icons.done_all_rounded,
            size: 15,
            // Blue — fakt sagle recipients ni vachla.
            color: r == Receipt.read ? const Color(0xFF7DD3FC) : timeColor,
            semanticLabel: r.name,
          ),
        ],
      ],
    );
    final media = a != null && !a.isAudio && (a.isImage || a.isVideo) && !m.deleted;
    final senderColor = widget.sender == null ? null : Wa.person(m.by);

    Widget bubble = Container(
      padding: media ? const EdgeInsets.all(4) : const EdgeInsets.fromLTRB(12, 8, 10, 7),
      decoration: BoxDecoration(
        color: mine ? null : Wa.theirs(context),
        gradient: mine ? const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF6D6AF6), Wa.accent]) : null,
        borderRadius: radius,
        // Web: theirs `border border-border`, mine plain accent.
        border: mine ? null : Border.all(color: Wa.border(context)),
        boxShadow: mine
            ? [BoxShadow(color: Wa.accent.withValues(alpha: .25), blurRadius: 10, offset: const Offset(0, 3), spreadRadius: -4)]
            : [BoxShadow(color: Colors.black.withValues(alpha: .03), blurRadius: 4, offset: const Offset(0, 1))],
      ),
      child: _tone(
        mine,
        IntrinsicWidth(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.sender != null)
                Padding(
                  padding: EdgeInsets.fromLTRB(media ? 6 : 0, media ? 2 : 0, 0, 3),
                  child: Text(
                    widget.sender!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: senderColor),
                  ),
                ),
              if (m.deleted)
                Wrap(
                  alignment: WrapAlignment.end,
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 8,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.block_rounded, size: 15, color: mine ? Wa.accentFg.withValues(alpha: .75) : Wa.muted(context)),
                        const SizedBox(width: 6),
                        Text(
                          mine ? 'You deleted this message' : 'This message was deleted',
                          style: TextStyle(fontSize: 14.5, fontStyle: FontStyle.italic, color: mine ? Wa.accentFg.withValues(alpha: .85) : Wa.muted(context)),
                        ),
                      ],
                    ),
                    Padding(padding: const EdgeInsets.only(top: 4, bottom: 1), child: time),
                  ],
                )
              else ...[
                if (m.forwarded)
                  Padding(
                    padding: EdgeInsets.fromLTRB(media ? 6 : 0, media ? 2 : 0, 0, 3),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.shortcut_rounded, size: 14, color: timeColor),
                        const SizedBox(width: 4),
                        Text('Forwarded', style: TextStyle(fontSize: 12, fontStyle: FontStyle.italic, color: timeColor)),
                      ],
                    ),
                  ),
                if (m.replyTo != null) _Quote(r: m.replyTo!, me: widget.me, onTap: () => widget.onJump(m.replyTo!.id)),
                if (a != null)
                  a.isAudio
                      ? VoiceNote(a: a, mine: mine)
                      : a.isImage
                      ? _ImageAttachment(a: a)
                      : a.isVideo
                      ? _VideoAttachment(a: a)
                      : _FileAttachment(a: a),
                Padding(
                  padding: EdgeInsets.fromLTRB(media ? 6 : 0, a != null || m.replyTo != null ? 4 : 0, media ? 4 : 0, media ? 2 : 0),
                  child: m.text.isEmpty
                      ? Align(alignment: Alignment.centerRight, child: time)
                      // Vel text chya shevti — jaga nasel tar khali.
                      : Wrap(
                          alignment: WrapAlignment.end,
                          crossAxisAlignment: WrapCrossAlignment.end,
                          spacing: 8,
                          children: [
                            Text.rich(
                              TextSpan(
                                children: _rich(
                                  m.text,
                                  TextStyle(
                                    fontWeight: FontWeight.w700,
                                    color: mine ? Wa.accentFg : Wa.accent,
                                    // Mala mention — halka background (WhatsApp sarkha).
                                    backgroundColor: m.mentions.contains(widget.me) ? Wa.accent.withValues(alpha: .14) : null,
                                  ),
                                  TextStyle(decoration: TextDecoration.underline, color: mine ? Wa.accentFg : Wa.accent),
                                ),
                              ),
                              style: TextStyle(fontSize: 15.5, height: 1.35, color: mine ? Wa.accentFg : Wa.text(context)),
                            ),
                            Padding(padding: const EdgeInsets.only(top: 4, bottom: 1), child: time),
                          ],
                        ),
                ),
              ],
            ],
          ),
        ),
      ),
    );

    // Navin aalela message — halka "pop" (pathavla / aala).
    if (widget.animate) bubble = _PopIn(fromRight: mine, child: bubble);

    final selecting = widget.selecting;
    return GestureDetector(
      onLongPress: selecting ? null : _menu,
      onTap: selecting ? widget.onToggleSelect : null,
      onHorizontalDragUpdate: m.deleted || selecting
          ? null
          : (d) {
              final dx = (_dx + d.delta.dx).clamp(0.0, 80.0);
              if (dx > 55 && !_armed) HapticFeedback.lightImpact();
              setState(() {
                _dx = dx;
                _armed = dx > 55;
              });
            },
      onHorizontalDragEnd: m.deleted || selecting
          ? null
          : (_) {
              if (_armed) widget.onReply();
              setState(() {
                _dx = 0;
                _armed = false;
              });
            },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        decoration: BoxDecoration(
          color: widget.highlight || widget.selected ? Wa.accent.withValues(alpha: .12) : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        padding: EdgeInsets.only(top: widget.first ? 8 : 2),
        child: Stack(
          alignment: Alignment.centerLeft,
          children: [
            if (_dx > 0)
              Opacity(
                opacity: (_dx / 55).clamp(0, 1),
                child: Transform.scale(
                  scale: _armed ? 1.1 : .9,
                  child: CircleAvatar(
                    radius: 15,
                    backgroundColor: _armed ? Wa.accent : Wa.surface2(context),
                    child: Icon(Icons.reply_rounded, size: 18, color: _armed ? Wa.accentFg : Wa.muted(context)),
                  ),
                ),
              ),
            AnimatedContainer(
              duration: Duration(milliseconds: _dx == 0 ? 250 : 0),
              curve: easeOutSoft,
              transform: Matrix4.translationValues(_dx, 0, 0),
              child: Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * (selecting ? .7 : .78)),
                  child: Column(
                    crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      bubble,
                      if (m.reactions.isNotEmpty && !m.deleted) _Reactions(m: m, me: widget.me, onTap: () => widget.onAction?.call(MsgAction.reactions)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Scale + fade + khalun var — bubble chya kopryatun (ujva / dava).
class _PopIn extends StatefulWidget {
  const _PopIn({required this.child, required this.fromRight});
  final Widget child;
  final bool fromRight;

  @override
  State<_PopIn> createState() => _PopInState();
}

class _PopInState extends State<_PopIn> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 380))..forward();
  late final _a = CurvedAnimation(parent: _c, curve: Curves.easeOutBack);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    child: widget.child,
    builder: (context, child) => Opacity(
      opacity: _c.value.clamp(0, 1),
      child: Transform.translate(
        offset: Offset(0, 16 * (1 - _a.value)),
        child: Transform.scale(scale: .85 + .15 * _a.value, alignment: widget.fromRight ? Alignment.bottomRight : Alignment.bottomLeft, child: child),
      ),
    ),
  );
}

/// Mine bubble = accent — aatla text / icons `accent-fg` (web `text-accent-fg`).
Widget _tone(bool mine, Widget child) => !mine
    ? child
    : OnAccent(
        child: DefaultTextStyle.merge(
          style: const TextStyle(color: Wa.accentFg),
          child: IconTheme.merge(
            data: const IconThemeData(color: Wa.accentFg),
            child: child,
          ),
        ),
      );

class _Quote extends StatelessWidget {
  const _Quote({required this.r, required this.me, required this.onTap});
  final ChatReply r;
  final String me;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Web: mine bubble madhe `border-white/70`, itar `border-accent`.
    final color = context.dependOnInheritedWidgetOfExactType<OnAccent>() != null ? Colors.white.withValues(alpha: .7) : Wa.accent;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(color: Wa.quote(context), borderRadius: BorderRadius.circular(6)),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                width: 4,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: const BorderRadius.horizontal(left: Radius.circular(6)),
                ),
              ),
              Flexible(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 5, 8, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r.by == me ? 'You' : r.byName,
                        style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                      Text(
                        r.preview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13, color: Wa.muted(context)),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

Future<String> _url(String path) => locator<ChatRepository>().attachmentUrl(path);

/// Photo — tap kela ki full screen (zoom + download).
class _ImageAttachment extends StatelessWidget {
  const _ImageAttachment({required this.a});
  final ChatAttachment a;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: _url(a.path),
      builder: (context, snap) {
        final url = snap.data;
        return GestureDetector(
          onTap: url == null ? null : () => MediaViewer.open(context, a, url: url),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              width: 240,
              height: 240,
              child: url == null
                  ? ColoredBox(
                      color: Wa.quote(context),
                      child: Center(child: snap.hasError ? const Icon(Icons.broken_image_outlined) : const CircularProgressIndicator(strokeWidth: 2)),
                    )
                  : Image.network(url, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined)),
            ),
          ),
        );
      },
    );
  }
}

/// Video — gadad tile + play (thumbnail sathi poorna video utarat nahi); tap → player + download.
class _VideoAttachment extends StatelessWidget {
  const _VideoAttachment({required this.a});
  final ChatAttachment a;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: () => MediaViewer.open(context, a),
    child: ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 240,
        height: 160,
        decoration: const BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)]),
        ),
        child: Stack(
          children: [
            const Center(
              child: CircleAvatar(
                radius: 26,
                backgroundColor: Colors.black45,
                child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 34),
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 8,
              child: Row(
                children: [
                  const Icon(Icons.videocam_rounded, color: Colors.white70, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      a.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 12),
                    ),
                  ),
                  Text(fileSize(a.size), style: const TextStyle(color: Colors.white70, fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _FileAttachment extends StatefulWidget {
  const _FileAttachment({required this.a});
  final ChatAttachment a;

  @override
  State<_FileAttachment> createState() => _FileAttachmentState();
}

class _FileAttachmentState extends State<_FileAttachment> {
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    try {
      final url = await _url(widget.a.path);
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final ext = a.name.contains('.') ? a.name.split('.').last.toUpperCase() : 'FILE';
    return InkWell(
      onTap: _busy ? null : _open,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Wa.quote(context), borderRadius: BorderRadius.circular(8)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _busy
                ? const SizedBox.square(
                    dimension: 32,
                    child: Padding(padding: EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                : Icon(ext == 'PDF' ? Icons.picture_as_pdf : Icons.insert_drive_file, size: 32, color: ext == 'PDF' ? Colors.redAccent : Wa.muted(context)),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    a.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  Text('$ext · ${fileSize(a.size)}', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  const _MenuItem({required this.icon, required this.label, required this.onTap, this.danger = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = danger ? Theme.of(context).colorScheme.error : Wa.text(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 22, color: c),
            const SizedBox(width: 16),
            Text(
              label,
              style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600, color: c),
            ),
          ],
        ),
      ),
    );
  }
}

/// Bubble khali — emoji ani kiti (tap → konakonache).
class _Reactions extends StatelessWidget {
  const _Reactions({required this.m, required this.me, required this.onTap});
  final ChatMessage m;
  final String me;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final counts = <String, int>{};
    for (final e in m.reactions.values) {
      counts[e] = (counts[e] ?? 0) + 1;
    }
    final mineE = m.reactions[me];
    return Transform.translate(
      offset: const Offset(0, -4),
      child: Material(
        color: Wa.surface(context),
        shape: StadiumBorder(side: BorderSide(color: Wa.border(context))),
        elevation: 1,
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final e in counts.entries) ...[
                  Text(e.key, style: TextStyle(fontSize: 14, fontWeight: e.key == mineE ? FontWeight.w700 : FontWeight.normal)),
                  if (e.value > 1) Padding(padding: const EdgeInsets.only(left: 2, right: 4), child: Text('${e.value}', style: TextStyle(fontSize: 11, color: Wa.muted(context)))),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
