import 'dart:async';
import 'dart:io';

import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' as foundation;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../../app/motion.dart';
import '../../../app/theme.dart';
import '../../../data/chat_repository.dart';
import '../../../data/models.dart';
import '../conversation_view.dart';
import 'avatar.dart';
import 'bubble.dart' show fileSize;
import 'mentions.dart';
import 'voice_note.dart' show mmss;

/// Kamal voice message — 5 min (web sarkha), mag apoaap jato.
const maxRecord = Duration(minutes: 5);

/// WhatsApp sarkha input: gol pill (emoji · text · attach · camera) + baju la gol mic / send.
class Composer extends StatefulWidget {
  const Composer({
    super.key,
    required this.me,
    required this.reply,
    required this.onCancelReply,
    required this.onSend,
    this.members = const [],
    this.editing,
    this.onCancelEdit,
    this.onEdit,
  });

  final String me;

  /// Group — `@` var dakhvayche members (mi sodun). 1:1 la rikama.
  final List<MentionMember> members;
  final ChatMessage? reply;
  final VoidCallback onCancelReply;

  /// null = gela; nahi tar error text (input parat bharto).
  final Future<String?> Function(Outgoing) onSend;

  /// Swatahcha message edit — text input madhe, send = save.
  final ChatMessage? editing;
  final VoidCallback? onCancelEdit;

  /// null = save zala; nahi tar error text.
  final Future<String?> Function(String text, List<String> mentions)? onEdit;

  @override
  State<Composer> createState() => _ComposerState();
}

class _ComposerState extends State<Composer> {
  final _text = MentionController();
  final _focus = FocusNode();
  final _recorder = AudioRecorder();
  File? _file;
  String? _fileName;
  bool _emoji = false;
  bool _sending = false;

  // Recording
  bool _recording = false;
  DateTime? _recStart;
  Duration _recFor = Duration.zero;
  Timer? _recTimer;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
    _focus.addListener(() {
      // Keyboard ughadla ki emoji band.
      setState(() {
        if (_focus.hasFocus) _emoji = false;
      });
    });
  }

  @override
  void didUpdateWidget(Composer old) {
    super.didUpdateWidget(old);
    if (widget.reply != null && widget.reply != old.reply) _focus.requestFocus();
    // Edit suru — juna text (cursor shevti); sampla / radd — rikama.
    final e = widget.editing;
    if (e?.id != old.editing?.id) {
      if (e != null) {
        _text.value = TextEditingValue(text: e.text, selection: TextSelection.collapsed(offset: e.text.length));
        _file = null;
        _fileName = null;
        _focus.requestFocus();
      } else {
        _text.clear();
      }
    }
  }

  @override
  void dispose() {
    _recTimer?.cancel();
    _recorder.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _toast(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  bool get _empty => _text.text.trim().isEmpty && _file == null && widget.editing?.attachment == null;

  Future<void> _deliver(Outgoing o) async {
    setState(() => _sending = true);
    final err = await widget.onSend(o);
    if (!mounted) return;
    setState(() => _sending = false);
    if (err != null) {
      _toast(err);
      // WhatsApp sarkha input lagech rikama kela hota — fail zala tar parat.
      if (_text.text.isEmpty) _text.text = o.text;
      if (_file == null && o.duration == null) {
        _file = o.file;
        _fileName = o.fileName;
      }
    }
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    final editing = widget.editing;
    if (editing != null) {
      if (_sending || _empty || widget.onEdit == null) return;
      setState(() => _sending = true);
      final err = await widget.onEdit!(body, mentionsIn(body, widget.members));
      if (!mounted) return;
      setState(() => _sending = false);
      if (err != null) _toast(err);
      return;
    }
    if (_sending || _empty) return;
    final o = Outgoing(text: body, file: _file, fileName: _fileName, mentions: mentionsIn(body, widget.members));
    _text.clear();
    setState(() {
      _file = null;
      _fileName = null;
    });
    await _deliver(o);
  }

  void _setFile(File f, String name) {
    final type = chatContentType(name);
    if (type == null) return _toast("This file type isn't allowed. Use images, videos, PDF, text, Office, ZIP or APK files.");
    if (f.lengthSync() > chatMaxFor(type)) return _toast('File is too large (max ${chatMaxFor(type) ~/ (1024 * 1024)} MB).');
    setState(() {
      _file = f;
      _fileName = name;
    });
  }

  Future<void> _pickDocument() async {
    final files = await FilePicker.pickFiles();
    final f = files.firstOrNull;
    if (f?.path != null) _setFile(File(f!.path!), f.name);
  }

  Future<void> _pickImage(ImageSource source) async {
    // imageQuality → JPEG (iOS HEIC server la chalat nahi) ani chhoti file.
    final x = await ImagePicker().pickImage(source: source, imageQuality: 80, maxWidth: 2560, maxHeight: 2560);
    if (x != null) {
      _setFile(File(x.path), x.name.toLowerCase().endsWith('.jpg') || x.name.toLowerCase().endsWith('.jpeg') ? x.name : '${x.name.split('.').first}.jpg');
    }
  }

  Future<void> _pickVideo() async {
    final x = await ImagePicker().pickVideo(source: ImageSource.gallery, maxDuration: const Duration(minutes: 5));
    if (x == null) return;
    final ext = x.name.contains('.') ? x.name.split('.').last.toLowerCase() : '';
    // Android kadhi kadhi extension shivay naav deto — mp4 samja.
    _setFile(File(x.path), ['mp4', 'mov', 'webm', '3gp'].contains(ext) ? x.name : '${x.name}.mp4');
  }

  void _attachSheet() {
    _focus.unfocus();
    showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(0, 4, 0, 24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              Rise(
                child: _AttachOption(
                  icon: Icons.insert_drive_file_rounded,
                  colors: const [Color(0xFF8B5CF6), Color(0xFF6366F1)],
                  label: 'Document',
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickDocument();
                  },
                ),
              ),
              Rise(
                index: 1,
                child: _AttachOption(
                  icon: Icons.camera_alt_rounded,
                  colors: const [Color(0xFFF43F5E), Color(0xFFEC4899)],
                  label: 'Camera',
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickImage(ImageSource.camera);
                  },
                ),
              ),
              Rise(
                index: 2,
                child: _AttachOption(
                  icon: Icons.photo_rounded,
                  colors: const [Color(0xFF0EA5E9), Color(0xFF06B6D4)],
                  label: 'Gallery',
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickImage(ImageSource.gallery);
                  },
                ),
              ),
              Rise(
                index: 3,
                child: _AttachOption(
                  icon: Icons.videocam_rounded,
                  colors: const [Color(0xFFF59E0B), Color(0xFFF97316)],
                  label: 'Video',
                  onTap: () {
                    Navigator.pop(ctx);
                    _pickVideo();
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _toggleEmoji() {
    if (_emoji) {
      _focus.requestFocus();
    } else {
      _focus.unfocus();
      setState(() => _emoji = true);
    }
  }

  // ── Voice message ──

  Future<void> _startRecording() async {
    if (!await _recorder.hasPermission()) return _toast('Microphone is blocked — allow it in phone settings.');
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000, numChannels: 1), path: path);
    _focus.unfocus();
    setState(() {
      _emoji = false;
      _recording = true;
      _recStart = DateTime.now();
      _recFor = Duration.zero;
    });
    _recTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      final d = DateTime.now().difference(_recStart!);
      setState(() => _recFor = d);
      if (d >= maxRecord) _stopRecording(send: true);
    });
  }

  Future<void> _stopRecording({required bool send}) async {
    if (!_recording) return;
    _recTimer?.cancel();
    final secs = DateTime.now().difference(_recStart!).inSeconds.clamp(1, maxRecord.inSeconds);
    setState(() => _recording = false);
    if (!send) {
      await _recorder.cancel();
      return;
    }
    final path = await _recorder.stop();
    if (path == null) return;
    final f = File(path);
    await _deliver(Outgoing(text: '', file: f, fileName: f.uri.pathSegments.last, duration: secs));
  }

  /// `@query` chya jagi `@Naav ` — anek mention chalto.
  void _pickMention(MentionMember m, ({int start, String query}) q) {
    final caret = _text.selection.baseOffset;
    final tag = '@${m.name} ';
    final text = _text.text.replaceRange(q.start, caret, tag);
    _text.value = TextEditingValue(text: text, selection: TextSelection.collapsed(offset: q.start + tag.length));
  }

  Widget _mentionList(List<MentionMember> matches, ({int start, String query}) q) {
    return Container(
      margin: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      constraints: const BoxConstraints(maxHeight: 240),
      decoration: BoxDecoration(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Wa.border(context)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .08), blurRadius: 16, offset: const Offset(0, 4))],
      ),
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.symmetric(vertical: 4),
        children: [
          for (final m in matches)
            InkWell(
              onTap: () => _pickMention(m, q),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Row(
                  children: [
                    Avatar(name: m.name, seed: m.uid, radius: 16),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(m.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final muted = Wa.muted(context);
    _text
      ..members = widget.members
      ..color = Wa.accent;
    // `@` lihila — group members (shodh).
    final q = widget.members.isEmpty || _recording ? null : mentionQuery(_text.value);
    final matches = q == null ? const <MentionMember>[] : mentionMatches(widget.members, q.query);
    // Varti resha / patti nahi — pill ani button chat wallpaper var tarangtat (WhatsApp sarkha).
    return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (q != null && matches.isNotEmpty) _mentionList(matches, q),
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 4, 6, 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(child: _recording ? _recordingPill(muted) : _inputPill(muted)),
                  const SizedBox(width: 6),
                  _roundButton(),
                ],
              ),
            ),
            if (_emoji)
              EmojiPicker(
                textEditingController: _text,
                config: Config(
                  height: 280,
                  checkPlatformCompatibility: true,
                  emojiViewConfig: EmojiViewConfig(
                    backgroundColor: Wa.surface(context),
                    columns: 8,
                    emojiSizeMax: 28 * (foundation.defaultTargetPlatform == TargetPlatform.iOS ? 1.2 : 1.0),
                  ),
                  categoryViewConfig: CategoryViewConfig(
                    backgroundColor: Wa.surface(context),
                    indicatorColor: Wa.accent,
                    iconColorSelected: Wa.accent,
                    backspaceColor: Wa.accent,
                  ),
                  bottomActionBarConfig: const BottomActionBarConfig(enabled: false),
                ),
              ),
          ],
        ),
    );
  }

  Widget _inputPill(Color muted) {
    final reply = widget.reply;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      // WhatsApp pill — bhovti resha nahi, fakt halki saavli.
      decoration: BoxDecoration(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .08), blurRadius: 3, offset: const Offset(0, 1))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedSize(
            duration: const Duration(milliseconds: 220),
            curve: easeOutSoft,
            child: Column(
              children: [
                if (widget.editing != null)
                  _replyPreview(widget.editing!, edit: true)
                else if (reply != null)
                  _replyPreview(reply),
                if (_file != null) _filePreview(),
              ],
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              IconButton(
                icon: Icon(_emoji ? Icons.keyboard : Icons.emoji_emotions_outlined, color: muted),
                onPressed: _toggleEmoji,
              ),
              Expanded(
                child: TextField(
                  controller: _text,
                  focusNode: _focus,
                  minLines: 1,
                  maxLines: 6,
                  maxLength: 4000,
                  textCapitalization: TextCapitalization.sentences,
                  keyboardType: TextInputType.multiline,
                  style: const TextStyle(fontSize: 16.5),
                  decoration: const InputDecoration(
                    hintText: 'Message',
                    counterText: '',
                    filled: false,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
              if (widget.editing == null)
                Transform.rotate(
                  angle: -0.6,
                  child: IconButton(
                    icon: Icon(Icons.attach_file, color: muted),
                    onPressed: _attachSheet,
                  ),
                ),
              // Camera — text lihitana lapto (WhatsApp sarkha).
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                child: _text.text.isEmpty && widget.editing == null
                    ? IconButton(
                        icon: Icon(Icons.camera_alt_outlined, color: muted),
                        onPressed: () => _pickImage(ImageSource.camera),
                      )
                    : const SizedBox(width: 4),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _recordingPill(Color muted) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: .08), blurRadius: 3, offset: const Offset(0, 1))],
      ),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
            tooltip: 'Discard',
            onPressed: () => _stopRecording(send: false),
          ),
          const _Blink(),
          const SizedBox(width: 8),
          Text(mmss(_recFor), style: const TextStyle(fontSize: 16, fontFeatures: [FontFeature.tabularFigures()])),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Recording… (max ${mmss(maxRecord)})',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: muted, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _roundButton() {
    final mic = _empty && !_recording && widget.editing == null;
    final icon = _sending
        ? const SizedBox.square(
            key: ValueKey('busy'),
            dimension: 22,
            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
          )
        : Icon(
            mic ? Icons.mic_rounded : (widget.editing != null ? Icons.check_rounded : Icons.send_rounded),
            key: ValueKey(mic ? 'mic' : (widget.editing != null ? 'save' : 'send')),
            color: Colors.white,
            size: 23,
          );
    final button = Pressable(
      scale: .9,
      onTap: _sending ? null : (_recording ? () => _stopRecording(send: true) : (mic ? _startRecording : _send)),
      child: Container(
        width: 48,
        height: 48,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Wa.green,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: Wa.green.withValues(alpha: .35), blurRadius: 12, offset: const Offset(0, 4), spreadRadius: -2)],
        ),
        // Mic ↔ send — firat + scale hot badalto.
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          transitionBuilder: (c, a) => RotationTransition(
            turns: Tween(begin: -.15, end: 0.0).animate(a),
            child: ScaleTransition(scale: a, child: c),
          ),
          child: icon,
        ),
      ),
    );
    return _recording ? PulseRing(color: Wa.green, size: 48, child: button) : button;
  }

  /// Reply bar — `edit` = "Edit message" (to message, X = edit radd).
  Widget _replyPreview(ChatMessage r, {bool edit = false}) {
    final mineReply = r.by == widget.me;
    // Web composer reply bar `#00a884`.
    const color = Wa.green;
    return Container(
      margin: const EdgeInsets.fromLTRB(6, 6, 6, 0),
      decoration: BoxDecoration(color: Wa.quote(context), borderRadius: BorderRadius.circular(8)),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              width: 4,
              decoration: BoxDecoration(
                color: color,
                borderRadius: const BorderRadius.horizontal(left: Radius.circular(8)),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 6, 4, 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      edit ? 'Edit message' : (mineReply ? 'You' : r.byName),
                      style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                    Text(
                      r.preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Wa.muted(context), fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
            IconButton(icon: const Icon(Icons.close, size: 18), onPressed: edit ? widget.onCancelEdit : widget.onCancelReply, visualDensity: VisualDensity.compact),
          ],
        ),
      ),
    );
  }

  Widget _filePreview() {
    final f = _file!;
    final name = _fileName ?? f.uri.pathSegments.last;
    final image = chatContentType(name)?.startsWith('image/') ?? false;
    return Container(
      margin: const EdgeInsets.fromLTRB(6, 6, 6, 0),
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: Wa.quote(context), borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: image
                ? Image.file(f, width: 44, height: 44, fit: BoxFit.cover)
                : SizedBox.square(dimension: 44, child: Icon(Icons.insert_drive_file, color: Wa.muted(context))),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w500),
                ),
                Text(fileSize(f.lengthSync()), style: TextStyle(fontSize: 12, color: Wa.muted(context))),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: () => setState(() {
              _file = null;
              _fileName = null;
            }),
          ),
        ],
      ),
    );
  }
}

class _AttachOption extends StatelessWidget {
  const _AttachOption({required this.icon, required this.colors, required this.label, required this.onTap});
  final IconData icon;
  final List<Color> colors;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: .92,
    child: Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
              boxShadow: [BoxShadow(color: colors.last.withValues(alpha: .35), blurRadius: 14, offset: const Offset(0, 6), spreadRadius: -4)],
            ),
            child: Icon(icon, color: Colors.white, size: 27),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Wa.text(context)),
          ),
        ],
      ),
    ),
  );
}

/// Recording chalu — lal thipka.
class _Blink extends StatefulWidget {
  const _Blink();

  @override
  State<_Blink> createState() => _BlinkState();
}

class _BlinkState extends State<_Blink> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: _c,
    child: const CircleAvatar(radius: 6, backgroundColor: Colors.redAccent),
  );
}
