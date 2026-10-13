import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../../../app/locator.dart';
import '../../../app/theme.dart';
import '../../../data/chat_repository.dart';
import '../../../data/models.dart';

String mmss(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

/// Voice message — pahilya play la URL ghevun vajavto.
class VoiceNote extends StatefulWidget {
  const VoiceNote({super.key, required this.a, required this.mine});
  final ChatAttachment a;
  final bool mine;

  @override
  State<VoiceNote> createState() => _VoiceNoteState();
}

class _VoiceNoteState extends State<VoiceNote> {
  final _player = AudioPlayer();
  bool _loaded = false;
  bool _loading = false;
  bool _failed = false;

  Future<void> _toggle() async {
    if (_player.playing) return _player.pause();
    if (!_loaded) {
      setState(() => _loading = true);
      try {
        await _player.setUrl(await locator<ChatRepository>().attachmentUrl(widget.a.path));
        _loaded = true;
      } catch (_) {
        setState(() => _failed = true);
        return;
      } finally {
        if (mounted) setState(() => _loading = false);
      }
    }
    if (_player.processingState == ProcessingState.completed) await _player.seek(Duration.zero);
    _player.play();
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = Duration(seconds: widget.a.duration ?? 0);
    return SizedBox(
      width: 250,
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: widget.mine ? Colors.white.withValues(alpha: .2) : Wa.accent,
            child: const Icon(Icons.mic, color: Colors.white, size: 22),
          ),
          StreamBuilder<PlayerState>(
            stream: _player.playerStateStream,
            builder: (context, snap) {
              final playing = snap.data?.playing == true && snap.data?.processingState != ProcessingState.completed;
              return IconButton(
                onPressed: _failed ? null : _toggle,
                icon: _loading
                    ? const SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(_failed ? Icons.error_outline : (playing ? Icons.pause : Icons.play_arrow), size: 30, color: Wa.muted(context)),
              );
            },
          ),
          Expanded(
            child: StreamBuilder<Duration>(
              stream: _player.positionStream,
              builder: (context, snap) {
                final len = _player.duration ?? total;
                final pos = snap.data ?? Duration.zero;
                final max = len.inMilliseconds <= 0 ? 1.0 : len.inMilliseconds.toDouble();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SliderTheme(
                      data: SliderTheme.of(context).copyWith(
                        trackHeight: 3,
                        thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                        overlayShape: SliderComponentShape.noOverlay,
                        activeTrackColor: widget.mine ? Wa.accentFg : Wa.accent,
                        thumbColor: widget.mine ? Wa.accentFg : Wa.accent,
                        inactiveTrackColor: Wa.muted(context).withValues(alpha: .35),
                      ),
                      child: Slider(
                        value: pos.inMilliseconds.clamp(0, max.toInt()).toDouble(),
                        max: max,
                        onChanged: _loaded ? (v) => _player.seek(Duration(milliseconds: v.round())) : null,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(_failed ? "Couldn't load audio" : mmss(pos > Duration.zero ? pos : len), style: TextStyle(fontSize: 11, color: Wa.muted(context))),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
