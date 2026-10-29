import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/inbox_repository.dart';
import '../tickets/ticket_detail_view.dart';

/// App bar cha bell — web `CoreNotificationBell` sarkha: na-vachlelyancha akda, tap → list.
class NotificationBell extends StatelessWidget {
  const NotificationBell({super.key});

  @override
  Widget build(BuildContext context) {
    final inbox = locator<InboxRepository>();
    return ValueListenableBuilder<List<InboxItem>?>(
      valueListenable: inbox.items,
      builder: (context, _, _) {
        final n = inbox.unread;
        return IconButton(
          tooltip: 'Notifications',
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NotificationsView())),
          icon: Badge(
            isLabelVisible: n > 0,
            backgroundColor: Colors.redAccent,
            label: Text(n > 9 ? '9+' : '$n'),
            child: Icon(n > 0 ? Icons.notifications_rounded : Icons.notifications_none_rounded),
          ),
        );
      },
    );
  }
}

/// Notifications — tickets (create / status / assign / comment / mention) ani Super Admin notices.
class NotificationsView extends StatelessWidget {
  const NotificationsView({super.key});

  Future<void> _open(BuildContext context, InboxItem n) async {
    final inbox = locator<InboxRepository>();
    if (!n.isRead) inbox.markRead(n.id).catchError((Object _) {});
    final ticketId = n.ticketId;
    if (ticketId != null) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => TicketDetailView(id: ticketId)));
      return;
    }
    // Notice — purna text.
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(n.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(_meta(n), style: TextStyle(color: Wa.muted(ctx), fontSize: 12)),
              const SizedBox(height: 14),
              Flexible(
                child: SingleChildScrollView(child: SelectableText(n.body, style: const TextStyle(fontSize: 15, height: 1.4))),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _meta(InboxItem n) {
    final at = n.at;
    final when = at == null ? '' : DateFormat('d MMM, h:mm a').format(at);
    return [if (n.byName.isNotEmpty) n.byName, if (when.isNotEmpty) when].join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final inbox = locator<InboxRepository>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          ValueListenableBuilder<List<InboxItem>?>(
            valueListenable: inbox.items,
            builder: (context, _, _) => inbox.unread == 0
                ? const SizedBox.shrink()
                : TextButton.icon(
                    onPressed: () => inbox.markAllRead().catchError((Object e) {
                      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
                    }),
                    icon: const Icon(Icons.done_all_rounded, size: 18),
                    label: const Text('Mark all read'),
                  ),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: ValueListenableBuilder<Object?>(
        valueListenable: inbox.error,
        builder: (context, err, _) => ValueListenableBuilder<List<InboxItem>?>(
          valueListenable: inbox.items,
          builder: (context, items, _) {
            if (items == null && err != null) return _Message(icon: Icons.cloud_off_rounded, text: errorText(err));
            if (items == null) return const Center(child: CircularProgressIndicator());
            if (items.isEmpty) return const _Message(icon: Icons.notifications_none_rounded, text: "You're all caught up.");
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 6),
              itemCount: items.length,
              separatorBuilder: (_, _) => Divider(height: 1, indent: 72, color: Wa.border(context)),
              itemBuilder: (context, i) {
                final n = items[i];
                final lines = n.body.split('\n').where((l) => l.trim().isNotEmpty).take(2).join(' · ');
                return ListTile(
                  onTap: () => _open(context, n),
                  tileColor: n.isRead ? null : Wa.accent.withValues(alpha: .06),
                  leading: CircleAvatar(
                    backgroundColor: Wa.accent.withValues(alpha: .12),
                    foregroundColor: Wa.accent,
                    child: Icon(n.ticketId != null ? Icons.confirmation_number_outlined : Icons.campaign_outlined, size: 20),
                  ),
                  title: Text(
                    n.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700),
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(lines, maxLines: 2, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 2),
                      Text(_meta(n), style: TextStyle(fontSize: 11.5, color: Wa.muted(context))),
                    ],
                  ),
                  trailing: n.isRead ? null : const Icon(Icons.circle, size: 9, color: Wa.accent),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: Wa.muted(context)),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: Wa.muted(context)),
          ),
        ],
      ),
    ),
  );
}
