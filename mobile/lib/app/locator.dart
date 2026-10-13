import 'package:flutter/widgets.dart';
import 'package:get_it/get_it.dart';

import '../data/chat_repository.dart';
import '../data/project_repository.dart';
import '../data/ticket_repository.dart';
import '../services/call_service.dart';
import '../services/push_service.dart';
import '../services/session_service.dart';

final locator = GetIt.instance;

/// Push tap / kuthunahi navigation sathi.
final navigatorKey = GlobalKey<NavigatorState>();

/// Home tab — 0 Chats, 1 Tickets, 2 Projects, 3 Dashboard, 4 Profile (push tap ne badalto).
final homeTab = ValueNotifier<int>(0);

void setupLocator() {
  locator
    ..registerLazySingleton(SessionService.new)
    ..registerLazySingleton(ChatRepository.new)
    ..registerLazySingleton(TicketRepository.new)
    ..registerLazySingleton(ProjectRepository.new)
    ..registerLazySingleton(PushService.new)
    ..registerLazySingleton(CallService.new);
}
