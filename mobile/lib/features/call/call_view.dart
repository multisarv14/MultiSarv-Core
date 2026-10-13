import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../services/call_service.dart';
import '../conversation/widgets/avatar.dart';

/// Call screen — web `CallScreen` sarkha: video (samorcha purna screen, swatah PiP) kinva voice
/// (photo + naav + avastha), khali buttons. Call sample — thoda vel "Call ended", mag band.
class CallView extends StatefulWidget {
  const CallView({super.key, required this.session});
  final CallSession session;

  @override
  State<CallView> createState() => _CallViewState();
}

class _CallViewState extends State<CallView> {
  Timer? _tick;
  bool _closing = false;

  CallSession get s => widget.session;

  @override
  void initState() {
    super.initState();
    s.addListener(_changed);
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  void _changed() {
    if (!mounted) return;
    setState(() {});
    if (s.ended && !_closing) {
      _closing = true;
      final msg = switch (s.error) {
        CallError.permission => s.video ? 'Allow camera and microphone for MultiSarv in phone Settings.' : 'Allow microphone for MultiSarv in phone Settings.',
        CallError.noDevice => 'Camera or microphone not available.',
        CallError.network => 'Connection lost. Check your network.',
        _ => null,
      };
      if (msg != null) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(msg)));
      Future.delayed(const Duration(milliseconds: 1800), () {
        if (mounted) Navigator.of(context).maybePop();
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    s.removeListener(_changed);
    super.dispose();
  }

  static String mmss(int secs) => '${secs ~/ 60}:${(secs % 60).toString().padLeft(2, '0')}';

  String get _status => switch (s.phase) {
    CallPhase.starting => 'Starting…',
    CallPhase.calling => 'Calling…',
    CallPhase.ringing => 'Ringing…',
    CallPhase.incoming => s.video ? 'Incoming video call' : 'Incoming voice call',
    CallPhase.connecting => 'Connecting…',
    CallPhase.reconnecting => 'Reconnecting…',
    CallPhase.connected => mmss(DateTime.now().difference(s.connectedAt ?? DateTime.now()).inSeconds),
    CallPhase.ended => switch (s.outcome) {
      'completed' => 'Call ended · ${mmss(s.duration)}',
      'missed' => s.outgoing ? 'No answer' : 'Missed call',
      'declined' => s.outgoing ? 'Call declined' : 'Declined',
      'busy' => 'User is on another call',
      'cancelled' => 'Call cancelled',
      'failed' => "Call failed — couldn't connect",
      _ => 'Call ended',
    },
  };

  @override
  Widget build(BuildContext context) {
    final live = s.phase == CallPhase.connected || s.phase == CallPhase.reconnecting;
    final showRemote = s.video && s.remoteVideo && live;
    return PopScope(
      // Back ne call band hot nahi — End button ne (WhatsApp sarkha).
      canPop: s.ended,
      child: Scaffold(
        backgroundColor: const Color(0xFF0B0D12),
        body: Stack(
          fit: StackFit.expand,
          children: [
            if (showRemote) RTCVideoView(s.remoteRenderer, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover),
            // Video call ughadtana swatah cha preview (samorcha jodaiparyant).
            if (s.video && !showRemote && !s.cameraOff && !s.ended)
              Opacity(
                opacity: .35,
                child: RTCVideoView(s.localRenderer, mirror: s.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover),
              ),
            SafeArea(
              child: Column(
                children: [
                  SizedBox(height: showRemote ? 8 : 48),
                  if (!showRemote) ...[
                    Avatar(name: s.peerName, seed: s.peerUid, radius: 56),
                    const SizedBox(height: 20),
                  ],
                  Text(
                    s.peerName,
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: showRemote ? 17 : 26, fontWeight: FontWeight.w700, shadows: const [Shadow(blurRadius: 8)]),
                  ),
                  const SizedBox(height: 6),
                  Text(_status, style: const TextStyle(color: Colors.white70, fontSize: 15, shadows: [Shadow(blurRadius: 8)])),
                  const Spacer(),
                  _controls(),
                  const SizedBox(height: 28),
                ],
              ),
            ),
            // Swatah — PiP (kopryat).
            if (showRemote && !s.cameraOff)
              Positioned(
                right: 16,
                bottom: 140,
                width: 112,
                height: 160,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: RTCVideoView(s.localRenderer, mirror: s.frontCamera, objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _controls() {
    if (s.ended) return const SizedBox(height: 64);
    if (s.phase == CallPhase.incoming) {
      return Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _Round(icon: Icons.call_end_rounded, label: 'Decline', color: const Color(0xFFE11D48), onTap: s.decline),
          _Round(icon: s.video ? Icons.videocam_rounded : Icons.call_rounded, label: 'Accept', color: const Color(0xFF00A884), onTap: s.accept),
        ],
      );
    }
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 14,
      runSpacing: 14,
      children: [
        _Round(icon: s.muted ? Icons.mic_off_rounded : Icons.mic_rounded, label: s.muted ? 'Unmute' : 'Mute', active: s.muted, onTap: s.toggleMute),
        _Round(icon: s.speaker ? Icons.volume_up_rounded : Icons.hearing_rounded, label: 'Speaker', active: s.speaker, onTap: s.toggleSpeaker),
        if (s.video) _Round(icon: s.cameraOff ? Icons.videocam_off_rounded : Icons.videocam_rounded, label: 'Camera', active: s.cameraOff, onTap: s.toggleCamera),
        if (s.video) _Round(icon: Icons.cameraswitch_rounded, label: 'Flip', onTap: s.switchCamera),
        _Round(icon: Icons.call_end_rounded, label: 'End', color: const Color(0xFFE11D48), onTap: s.hangup),
      ],
    );
  }
}

class _Round extends StatelessWidget {
  const _Round({required this.icon, required this.label, required this.onTap, this.color, this.active = false});
  final IconData icon;
  final String label;
  final FutureOr<void> Function() onTap;
  final Color? color;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final bg = color ?? (active ? Colors.white : Colors.white.withValues(alpha: .15));
    final fg = color != null ? Colors.white : (active ? const Color(0xFF0B0D12) : Colors.white);
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: bg,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => onTap(),
          child: SizedBox(width: 62, height: 62, child: Icon(icon, color: fg, size: 28)),
        ),
      ),
    );
  }
}
