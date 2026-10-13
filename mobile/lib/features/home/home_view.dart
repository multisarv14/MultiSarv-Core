import 'package:flutter/material.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../services/call_service.dart';
import '../../services/push_service.dart';
import '../../services/session_service.dart';
import '../chats/chats_view.dart';
import '../dashboard/dashboard_view.dart';
import '../profile/profile_view.dart';
import '../projects/projects_view.dart';
import '../tickets/ticket_detail_view.dart';
import '../tickets/tickets_view.dart';

/// Login nantar — WhatsApp sarkhe khali tabs: Chats, Tickets (Dev / Client), Projects, Dashboard, Profile.
class HomeView extends StatefulWidget {
  const HomeView({super.key});

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  @override
  void initState() {
    super.initState();
    homeTab.value = 0;
    // Calls — incoming aika (native ring), app band astana uchallela call joda.
    locator<CallService>().start(locator<SessionService>().me.uid);
    // Push tap (ticket assign) — Tickets tab + to ticket. Chats `init` push start karnya aadhi set.
    locator<PushService>().onOpenTicket = (id) {
      homeTab.value = 1;
      navigatorKey.currentState
        ?..popUntil((r) => r.isFirst)
        ..push(MaterialPageRoute(builder: (_) => TicketDetailView(id: id)));
    };
  }

  @override
  void dispose() {
    locator<CallService>().stop();
    super.dispose();
  }

  static const _tabs = [
    (Icons.chat_bubble_outline_rounded, Icons.chat_bubble_rounded, 'Chats'),
    (Icons.confirmation_number_outlined, Icons.confirmation_number_rounded, 'Tickets'),
    (Icons.folder_copy_outlined, Icons.folder_copy_rounded, 'Projects'),
    (Icons.space_dashboard_outlined, Icons.space_dashboard_rounded, 'Dashboard'),
    (Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: homeTab,
      builder: (context, tab, _) => Scaffold(
        // Sagle tabs jivant (chat stream, tickets list scroll) — WhatsApp sarkha.
        body: IndexedStack(index: tab, children: const [ChatsView(), TicketsView(), ProjectsView(), DashboardView(), ProfileView()]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: tab,
          backgroundColor: Wa.surface(context),
          indicatorColor: Wa.accent.withValues(alpha: .14),
          height: 66,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (i) => homeTab.value = i,
          destinations: [
            for (final t in _tabs)
              NavigationDestination(
                icon: Icon(t.$1),
                selectedIcon: Icon(t.$2, color: Wa.accent),
                label: t.$3,
              ),
          ],
        ),
      ),
    );
  }
}
