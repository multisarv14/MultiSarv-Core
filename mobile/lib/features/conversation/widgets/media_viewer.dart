import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';
import 'package:video_player/video_player.dart';

import '../../../app/locator.dart';
import '../../../data/chat_repository.dart';
import '../../../data/models.dart';

/// Photo / video full screen (WhatsApp sarkha) — zoom, play, ani gallery madhe download.
class MediaViewer extends StatefulWidget {
  const MediaViewer({super.key, required this.a, this.url});
  final ChatAttachment a;

  /// Aadhich milalela URL (bubble madhe) — nasel tar ithe milvto.
  final String? url;

  static Future<void> open(BuildContext context, ChatAttachment a, {String? url}) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => MediaViewer(a: a, url: url),
    ),
  );

  @override
  State<MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends State<MediaViewer> {
  String? _url;
  String? _error;
  VideoPlayerController? _video;
  bool _saving = false;
  bool _chrome = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final url = widget.url ?? await locator<ChatRepository>().attachmentUrl(widget.a.path);
      if (!mounted) return;
      setState(() => _url = url);
      if (widget.a.isVideo) {
        final c = VideoPlayerController.networkUrl(Uri.parse(url));
        _video = c;
        await c.initialize();
        c.addListener(_tick);
        await c.play();
        if (mounted) setState(() {});
      }
    } catch (e) {
      if (mounted) setState(() => _error = "Couldn't load this ${widget.a.isVideo ? 'video' : 'photo'}.");
    }
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _video?.removeListener(_tick);
    _video?.dispose();
    super.dispose();
  }

  /// File temp madhe utarun gallery madhe (Gal) — Photos / Gallery app madhe disto.
  Future<void> _download() async {
    final url = _url;
    if (url == null || _saving) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _saving = true);
    File? tmp;
    try {
      if (!await Gal.hasAccess() && !await Gal.requestAccess()) {
        throw Exception('Allow photo access in phone Settings to save.');
      }
      final dir = await getTemporaryDirectory();
      final safe = widget.a.name.replaceAll(RegExp(r'[^\w.\- ]+'), '_');
      tmp = File('${dir.path}/${DateTime.now().millisecondsSinceEpoch}-$safe');
      final client = HttpClient();
      try {
        final res = await (await client.getUrl(Uri.parse(url))).close();
        if (res.statusCode != 200) throw Exception('Download failed (${res.statusCode}).');
        await res.pipe(tmp.openWrite());
      } finally {
        client.close();
      }
      widget.a.isVideo ? await Gal.putVideo(tmp.path) : await Gal.putImage(tmp.path);
      messenger.showSnackBar(SnackBar(content: Text('Saved to ${Platform.isIOS ? 'Photos' : 'Gallery'}')));
    } on GalException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.type.message)));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
    } finally {
      unawaited(tmp?.delete().then((_) {}, onError: (_) {}));
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.black.withValues(alpha: _chrome ? .45 : 0),
        foregroundColor: Colors.white,
        elevation: 0,
        shape: const Border(),
        title: Text(
          a.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 15, color: Colors.white),
        ),
        actions: [
          IconButton(
            tooltip: 'Download',
            onPressed: _url == null || _saving ? null : _download,
            icon: _saving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.download_rounded, color: Colors.white),
          ),
        ],
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => setState(() => _chrome = !_chrome),
        child: Center(child: _body()),
      ),
    );
  }

  Widget _body() {
    if (_error != null) return Text(_error!, style: const TextStyle(color: Colors.white70));
    final url = _url;
    if (url == null) return const CircularProgressIndicator(color: Colors.white);
    if (!widget.a.isVideo) {
      return InteractiveViewer(
        maxScale: 5,
        child: Image.network(
          url,
          loadingBuilder: (_, child, p) => p == null ? child : const CircularProgressIndicator(color: Colors.white),
          errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
        ),
      );
    }
    final c = _video;
    if (c == null || !c.value.isInitialized) return const CircularProgressIndicator(color: Colors.white);
    final v = c.value;
    return Stack(
      alignment: Alignment.center,
      children: [
        AspectRatio(aspectRatio: v.aspectRatio, child: VideoPlayer(c)),
        AnimatedOpacity(
          opacity: _chrome || !v.isPlaying ? 1 : 0,
          duration: const Duration(milliseconds: 200),
          child: IconButton.filled(
            iconSize: 40,
            style: IconButton.styleFrom(backgroundColor: Colors.black45, foregroundColor: Colors.white),
            onPressed: () {
              if (v.isPlaying) {
                c.pause();
              } else {
                if (v.position >= v.duration) c.seekTo(Duration.zero);
                c.play();
              }
            },
            icon: Icon(v.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: AnimatedOpacity(
            opacity: _chrome ? 1 : 0,
            duration: const Duration(milliseconds: 200),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Row(
                  children: [
                    Text(_mmss(v.position), style: const TextStyle(color: Colors.white, fontSize: 12)),
                    Expanded(
                      child: VideoProgressIndicator(
                        c,
                        allowScrubbing: true,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                        colors: const VideoProgressColors(playedColor: Colors.white, bufferedColor: Colors.white38, backgroundColor: Colors.white12),
                      ),
                    ),
                    Text(_mmss(v.duration), style: const TextStyle(color: Colors.white, fontSize: 12)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

String _mmss(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
