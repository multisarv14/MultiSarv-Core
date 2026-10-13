import 'package:flutter/material.dart';

import '../../app/locator.dart';
import '../../core/backend.dart';
import '../../data/ticket_repository.dart';
import '../../services/session_service.dart';

/// Navin ticket — title, description, project, priority (+ assign permission asel tar assignee).
/// Banla ki tyacha id parat (list to ticket ughadte).
class RaiseTicketView extends StatefulWidget {
  const RaiseTicketView({super.key, required this.kind});
  final TicketKind kind;

  @override
  State<RaiseTicketView> createState() => _RaiseTicketViewState();
}

class _RaiseTicketViewState extends State<RaiseTicketView> {
  final _repo = locator<TicketRepository>();
  final Me _me = locator<SessionService>().me;
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _desc = TextEditingController();

  List<ProjectOption>? _projects;
  String _project = multisarvId;
  TicketPriority _priority = TicketPriority.medium;
  Future<List<Person>>? _assignees;
  String? _assignee;
  bool _busy = false;

  bool get _canAssign => _me.can(widget.kind.module, 'assign');

  @override
  void initState() {
    super.initState();
    _repo.projects().then((p) {
      // Dev: fakt mala allowed projects (Multisarv sagle Core users); server pan tapasto.
      final list = widget.kind == TicketKind.dev && !_me.superAdmin ? p.where((x) => x.id == multisarvId || _me.projects.contains(x.id)).toList() : p;
      if (mounted) setState(() => _projects = list);
    });
    _loadAssignees();
  }

  void _loadAssignees() {
    if (_canAssign) _assignees = _repo.assignees(widget.kind, _project);
  }

  @override
  void dispose() {
    _title.dispose();
    _desc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final id = await _repo.raise(
        widget.kind,
        title: _title.text.trim(),
        description: _desc.text.trim(),
        projectId: _project,
        priority: _priority,
        assignee: _assignee,
      );
      if (mounted) Navigator.pop(context, id);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Raise ${widget.kind == TicketKind.dev ? 'dev' : 'client'} ticket')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _title,
              maxLength: 150,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Title'),
              validator: (v) => (v ?? '').trim().length < 3 ? 'Title must be 3–150 characters.' : null,
            ),
            const SizedBox(height: 8),
            TextFormField(
              controller: _desc,
              minLines: 4,
              maxLines: 10,
              maxLength: 5000,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Description', alignLabelWithHint: true),
              validator: (v) => (v ?? '').trim().length < 3 ? 'Description must be 3–5000 characters.' : null,
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _project,
              decoration: const InputDecoration(labelText: 'Project'),
              items: [
                for (final p in _projects ?? const [ProjectOption(multisarvId, 'Multisarv')]) DropdownMenuItem(value: p.id, child: Text(p.name)),
              ],
              onChanged: (v) => setState(() {
                _project = v ?? multisarvId;
                // Dev: assignee la navin project cha access lagto — list punha.
                _assignee = null;
                _loadAssignees();
              }),
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<TicketPriority>(
              initialValue: _priority,
              decoration: const InputDecoration(labelText: 'Priority'),
              items: [
                for (final p in TicketPriority.values)
                  DropdownMenuItem(
                    value: p,
                    child: Row(
                      children: [
                        Icon(Icons.flag_rounded, size: 16, color: p.color),
                        const SizedBox(width: 8),
                        Text(p.label),
                      ],
                    ),
                  ),
              ],
              onChanged: (v) => setState(() => _priority = v ?? TicketPriority.medium),
            ),
            if (_canAssign) ...[
              const SizedBox(height: 16),
              FutureBuilder<List<Person>>(
                key: ValueKey(_project),
                future: _assignees,
                builder: (context, snap) => DropdownButtonFormField<String?>(
                  initialValue: _assignee,
                  decoration: InputDecoration(labelText: 'Assign to (optional)', helperText: snap.hasData ? null : 'Loading…'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('Unassigned')),
                    for (final p in snap.data ?? const <Person>[]) DropdownMenuItem<String?>(value: p.uid, child: Text(p.label)),
                  ],
                  onChanged: (v) => setState(() => _assignee = v),
                ),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _submit,
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Raise ticket', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ),
    );
  }
}
