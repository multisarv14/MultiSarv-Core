import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/project_repository.dart';
import '../../services/session_service.dart';
import '../conversation/widgets/avatar.dart';

/// Majhe projects (web `/projects`) — super admin la sagle, itaranna Module Access madhle.
class ProjectsView extends StatefulWidget {
  const ProjectsView({super.key});

  @override
  State<ProjectsView> createState() => _ProjectsViewState();
}

class _ProjectsViewState extends State<ProjectsView> with AutomaticKeepAliveClientMixin {
  final Me _me = locator<SessionService>().me;
  late final StreamSubscription<List<Project>> _sub;
  List<Project>? _projects;
  String? _error;
  String _query = '';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _sub = locator<ProjectRepository>().all().listen(
      (p) {
        if (mounted) setState(() => _projects = p.where((x) => _me.superAdmin || _me.projects.contains(x.id)).toList());
      },
      onError: (Object e) {
        if (mounted) setState(() => _error = errorText(e));
      },
    );
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final q = _query.trim().toLowerCase();
    final list = (_projects ?? const <Project>[]).where((p) => q.isEmpty || p.name.toLowerCase().contains(q) || p.client.toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Wa.bg(context),
        titleSpacing: 16,
        title: const Text('Projects', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 24, letterSpacing: -.6)),
        actions: const [ThemeToggle(), SizedBox(width: 8)],
      ),
      body: _projects == null
          ? Center(
              child: _error != null ? Text(_error!, style: TextStyle(color: Wa.muted(context))) : const CircularProgressIndicator(),
            )
          : ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v),
                    decoration: const InputDecoration(hintText: 'Search projects', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                  ),
                ),
                if (list.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Text(
                      _projects!.isEmpty ? 'No projects assigned to you yet.' : 'No projects match.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Wa.muted(context)),
                    ),
                  ),
                for (var i = 0; i < list.length; i++)
                  Rise(
                    key: ValueKey(list[i].id),
                    index: i,
                    child: ProjectTile(
                      project: list[i],
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ProjectDetailView(project: list[i]))),
                    ),
                  ),
              ],
            ),
    );
  }
}

class ProjectMark extends StatelessWidget {
  const ProjectMark({super.key, required this.project, this.size = 44});
  final Project project;
  final double size;

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(size * .28),
    child: SizedBox.square(
      dimension: size,
      child: project.logo != null ? Image.memory(project.logo!, fit: BoxFit.cover, errorBuilder: (_, _, _) => _letter()) : _letter(),
    ),
  );

  Widget _letter() => DecoratedBox(
    decoration: BoxDecoration(
      gradient: LinearGradient(colors: [project.accent, project.accent.withValues(alpha: .7)], begin: Alignment.topLeft, end: Alignment.bottomRight),
    ),
    child: Center(
      child: Text(
        project.name.isEmpty ? '?' : project.name[0].toUpperCase(),
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: size * .42),
      ),
    ),
  );
}

class ProjectStatusPill extends StatelessWidget {
  const ProjectStatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = projectStatusColors[status] ?? Wa.accent;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: .14), borderRadius: BorderRadius.circular(20)),
      child: Text(
        projectStatusLabels[status] ?? status,
        style: TextStyle(color: c, fontSize: 11.5, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class ProjectTile extends StatelessWidget {
  const ProjectTile({super.key, required this.project, required this.onTap});
  final Project project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = project;
    final muted = Wa.muted(context);
    final sub = [if (p.client.isNotEmpty) p.client, if (p.type != null) projectTypeLabels[p.type]!].join(' · ');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: Material(
        color: Wa.surface(context),
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Wa.border(context)),
            ),
            child: Row(
              children: [
                ProjectMark(project: p),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15.5, color: Wa.text(context)),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        sub.isNotEmpty ? sub : (p.tagline.isNotEmpty ? p.tagline : '—'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: muted),
                      ),
                    ],
                  ),
                ),
                if (p.status != null) ...[const SizedBox(width: 8), ProjectStatusPill(p.status!)],
                Icon(Icons.chevron_right_rounded, color: muted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Project overview (web ProjectOverview) — mahiti ani team.
class ProjectDetailView extends StatelessWidget {
  const ProjectDetailView({super.key, required this.project});
  final Project project;

  String _date(String? d) {
    final v = d == null ? null : DateTime.tryParse(d);
    return v == null ? '—' : DateFormat('dd MMM yyyy').format(v);
  }

  @override
  Widget build(BuildContext context) {
    final p = project;
    final muted = Wa.muted(context);
    return Scaffold(
      backgroundColor: Wa.bg(context),
      appBar: AppBar(title: Text(p.name)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              ProjectMark(project: p, size: 64),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      p.name,
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -.4, color: Wa.text(context)),
                    ),
                    if (p.tagline.isNotEmpty) Text(p.tagline, style: TextStyle(color: muted)),
                    if (p.status != null) ...[const SizedBox(height: 6), ProjectStatusPill(p.status!)],
                  ],
                ),
              ),
            ],
          ),
          if (p.description.isNotEmpty) ...[const SizedBox(height: 16), SelectableText(p.description, style: TextStyle(height: 1.45, color: Wa.text(context)))],
          const SizedBox(height: 16),
          _Section(
            children: [
              _Info('Client', p.client.isEmpty ? '—' : p.client),
              _Info('Type', projectTypeLabels[p.type] ?? '—'),
              _Info('Start', _date(p.startDate)),
              _Info('End', _date(p.endDate)),
              _Info('Manager', p.manager?.label ?? '—'),
            ],
          ),
          if (p.team.isNotEmpty) ...[
            const SizedBox(height: 18),
            Text(
              'Team (${p.team.length})',
              style: TextStyle(fontWeight: FontWeight.w700, color: Wa.text(context)),
            ),
            const SizedBox(height: 8),
            _Section(
              children: [
                for (final m in p.team)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Avatar(name: m.label, seed: m.uid, radius: 16),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                m.label,
                                style: TextStyle(fontWeight: FontWeight.w600, color: Wa.text(context)),
                              ),
                              Text(m.email, style: TextStyle(fontSize: 12, color: muted)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
    decoration: BoxDecoration(
      color: Wa.surface(context),
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: Wa.border(context)),
    ),
    child: Column(children: children),
  );
}

class _Info extends StatelessWidget {
  const _Info(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Row(
      children: [
        SizedBox(
          width: 90,
          child: Text(label, style: TextStyle(color: Wa.muted(context), fontSize: 13)),
        ),
        Expanded(
          child: Text(
            value,
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: Wa.text(context)),
          ),
        ),
      ],
    ),
  );
}
