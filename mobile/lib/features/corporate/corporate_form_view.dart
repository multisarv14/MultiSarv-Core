import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/corporate_repository.dart';

/// Navin / edit — server schema varun form (web `RecordForm.tsx` sarkha). Server pan hech tapasto.
/// Save zala ki record id parat (`Navigator.pop`).
class CorporateFormView extends StatefulWidget {
  const CorporateFormView({super.key, required this.schema, required this.kind, this.row, this.preset});
  final CorpSchema schema;
  final CorpKind kind;
  final CorpRow? row;
  final Map<String, Object?>? preset;

  @override
  State<CorporateFormView> createState() => _CorporateFormViewState();
}

class _CorporateFormViewState extends State<CorporateFormView> {
  final _repo = locator<CorporateRepository>();
  final Map<String, Object?> _form = {};
  final Map<String, TextEditingController> _text = {};
  final Map<String, Future<List<({String id, String title})>>> _options = {};
  bool _touched = false;
  bool _saving = false;
  String? _serverField;

  CorpKind get _kind => widget.kind;

  @override
  void initState() {
    super.initState();
    for (final f in _kind.fields) {
      final v = widget.row?[f.key] ?? widget.preset?[f.key];
      _form[f.key] = f.type == 'bool' ? v == true : (v == null ? '' : (f.isNumber && v is num && v % 1 == 0 ? '${v.toInt()}' : '$v'));
      if (widget.row == null && f.type == 'select' && f.required && _form[f.key] == '' && f.options.isNotEmpty) _form[f.key] = f.options.first.value;
      if (const ['text', 'textarea', 'email', 'phone', 'url', 'number', 'money', 'percent'].contains(f.type)) {
        _text[f.key] = TextEditingController(text: '${_form[f.key]}');
      }
      if (f.type == 'ref') _options[f.key] = _repo.options(f.ref!);
    }
  }

  @override
  void dispose() {
    for (final c in _text.values) {
      c.dispose();
    }
    super.dispose();
  }

  List<CorpField> get _visible => _kind.fields.where((f) => corpVisible(_kind.kind, f, _form)).toList();

  String? _error(CorpField f) {
    if (_serverField == f.key) return 'Please check this value';
    return _touched ? corpValidate(f, _form[f.key], widget.schema) : null;
  }

  Future<void> _save() async {
    setState(() {
      _touched = true;
      _serverField = null;
    });
    if (_visible.any((f) => corpValidate(f, _form[f.key], widget.schema) != null)) {
      _toast('Please fix the highlighted fields.');
      return;
    }
    setState(() => _saving = true);
    try {
      final data = <String, Object?>{};
      for (final f in _kind.fields) {
        final v = _form[f.key];
        if (!corpVisible(_kind.kind, f, _form)) {
          data[f.key] = f.type == 'bool' ? false : null;
        } else if (f.isNumber) {
          data[f.key] = '$v'.trim().isEmpty ? null : num.parse('$v'.replaceAll(',', ''));
        } else if (v is String) {
          data[f.key] = v.trim().isEmpty ? null : v.trim();
        } else {
          data[f.key] = v;
        }
      }
      final r = await _repo.save(_kind.kind, _kind.singleton ? null : widget.row?.id, data);
      if (!mounted) return;
      _toast(!r.changed ? 'No changes to save' : (r.nextId != null ? 'Saved — next due item created' : 'Saved'));
      Navigator.of(context).pop(r.id);
    } on AppError catch (e) {
      final f = e.field == null ? null : _kind.field(e.field!);
      setState(() => _serverField = e.field);
      _toast(f != null ? '${f.label}: please check this value.' : e.message);
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  void _set(String key, Object? v) => setState(() {
    _form[key] = v;
    if (_serverField == key) _serverField = null;
  });

  Widget _control(CorpField f) {
    final label = '${f.label}${f.required && f.type != 'bool' ? ' *' : ''}';
    final deco = InputDecoration(labelText: label, helperText: f.hint, errorText: _error(f), helperMaxLines: 2);
    switch (f.type) {
      case 'bool':
        return SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(f.label), value: _form[f.key] == true, onChanged: (v) => _set(f.key, v));
      case 'select':
        final v = '${_form[f.key]}';
        return DropdownButtonFormField<String>(
          initialValue: v.isEmpty ? null : v,
          isExpanded: true,
          decoration: deco,
          items: [
            if (!f.required) const DropdownMenuItem(value: '', child: Text('—')),
            for (final o in f.options) DropdownMenuItem(value: o.value, child: Text(o.label, overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (x) => _set(f.key, x ?? ''),
        );
      case 'ref':
        return FutureBuilder(
          future: _options[f.key],
          builder: (context, snap) {
            final list = snap.data ?? const [];
            final v = '${_form[f.key]}';
            return DropdownButtonFormField<String>(
              key: ValueKey('${f.key}-${list.length}'),
              initialValue: v.isEmpty || !list.any((o) => o.id == v) ? null : v,
              isExpanded: true,
              decoration: deco.copyWith(hintText: snap.connectionState == ConnectionState.waiting ? 'Loading…' : 'Select…'),
              items: [
                if (!f.required) const DropdownMenuItem(value: '', child: Text('—')),
                for (final o in list) DropdownMenuItem(value: o.id, child: Text(o.title, overflow: TextOverflow.ellipsis)),
              ],
              onChanged: (x) => _set(f.key, x ?? ''),
            );
          },
        );
      case 'date':
        final d = corpDate(_form[f.key]);
        return InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final picked = await showDatePicker(context: context, initialDate: d ?? DateTime.now(), firstDate: DateTime(1950), lastDate: DateTime(2100));
            if (picked != null) _set(f.key, DateFormat('yyyy-MM-dd').format(picked));
          },
          child: InputDecorator(
            decoration: deco.copyWith(
              suffixIcon: d == null
                  ? const Icon(Icons.calendar_today_rounded, size: 18)
                  : IconButton(icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => _set(f.key, '')),
            ),
            child: Text(d == null ? '' : corpDateText(_form[f.key])),
          ),
        );
      default:
        return TextField(
          controller: _text[f.key],
          maxLines: f.type == 'textarea' ? null : 1,
          minLines: f.type == 'textarea' ? 3 : 1,
          maxLength: f.type == 'textarea' && (f.max ?? 0) > 2000 ? null : f.max,
          keyboardType: switch (f.type) {
            'email' => TextInputType.emailAddress,
            'phone' => TextInputType.phone,
            'url' => TextInputType.url,
            'number' || 'money' || 'percent' => const TextInputType.numberWithOptions(decimal: true),
            'textarea' => TextInputType.multiline,
            _ => TextInputType.text,
          },
          textCapitalization: f.pattern != null ? TextCapitalization.characters : TextCapitalization.sentences,
          decoration: deco.copyWith(
            hintText: corpExample(f.pattern),
            prefixText: f.type == 'money' ? '₹ ' : null,
            suffixText: f.type == 'percent' ? '%' : null,
            counterText: '',
          ),
          onChanged: (v) => _set(f.key, f.pattern != null ? v.toUpperCase() : v),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.row != null || (_kind.singleton && widget.preset == null);
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Wa.bg(context),
        title: Text(editing ? 'Edit ${_kind.singular}' : 'New ${_kind.singular}', style: const TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Save'),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
          children: [
            for (final f in _visible) Padding(padding: const EdgeInsets.only(bottom: 14), child: _control(f)),
          ],
        ),
      ),
    );
  }
}
