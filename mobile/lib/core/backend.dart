import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Multisarv core backend — web panel (`src/lib/firebase.ts`) sarkhech:
/// sagle writes Cloud Functions (`core/functions`) madhun, region asia-south1.
const coreRegion = 'asia-south1';

final _functions = FirebaseFunctions.instanceFor(region: coreRegion);

/// Callable → `Map` / `List`. Server `core.err.*` key pathavto — tyacha message [AppError] madhe.
Future<T> callCore<T>(String name, [Map<String, dynamic> data = const {}]) async {
  try {
    final res = await _functions.httpsCallable(name).call<dynamic>(data);
    return res.data as T;
  } on FirebaseFunctionsException catch (e) {
    throw AppError(errorText(e.message ?? e.code));
  }
}

class AppError implements Exception {
  AppError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Core functions che error keys (`core.err.*`, web `src/i18n/messages/coreAdmin.ts`) → text.
const _errors = {
  'signIn': 'Please sign in again.',
  'disabled': 'Your account is disabled. Contact the super admin.',
  'chatBadUser': 'Select an active Core user.',
  'chatTooLong': 'Message is too long (max 4000 characters).',
  'chatBadFile': 'Attachment is invalid or not allowed.',
  'chatEmpty': 'Type a message or attach a file.',
  'chatBadReply': "The message you're replying to was not found.",
  'chatDenied': "You can't access this chat.",
  'badPushToken': 'Invalid notification token.',
  'chatBadMessage': 'Message not found.',
  'chatDeleteDenied': 'You can only delete your own messages for everyone.',
  'groupBadName': 'Group name must be 1–60 characters.',
  'groupBadMembers': 'Pick at least one member (max 100).',
  'groupAdminOnly': 'Only group admins can change group settings or members.',
  'callBadSignal': 'Call setup failed. Please try again.',
  'callNotFound': 'This call no longer exists.',
  'callDenied': 'You are not part of this call.',
  'callYouBusy': "You're already on another call.",
  'callOver': 'This call has already ended.',
  'groupAdminsOnlySend': 'Only group admins can send messages in this group.',
  'chatBadReaction': "That reaction isn't supported.",
  'groupBadDescription': 'Group description can be up to 500 characters.',
  'groupBadPhoto': "That group photo can't be used. Pick a PNG, JPG or WebP image.",
  'ticketDenied': "You don't have permission for this ticket action.",
  'badTicketKind': 'Unknown ticket type.',
  'badTitle': 'Title must be 3–150 characters.',
  'badDescription': 'Description must be 3–5000 characters.',
  'badProject': 'Choose a valid project.',
  'badPriority': 'Select a valid priority.',
  'badModule': 'Select a module of the selected project.',
  'badAssignee': "This user can't be assigned — they need View access to this module.",
  'badStatusMove': "This status change isn't allowed.",
  'ticketNotFound': 'Ticket not found.',
  'badComment': 'Comment must be 1–2000 characters.',
};

String errorText(Object err) {
  if (err is AppError) return err.message;
  if (err is FirebaseAuthException) {
    switch (err.code) {
      case 'invalid-credential':
      case 'wrong-password':
      case 'user-not-found':
      case 'invalid-email':
        return 'Wrong email or password.';
      case 'user-disabled':
        return 'Your account is disabled. Contact the super admin.';
      case 'too-many-requests':
        return 'Too many attempts — try again in a few minutes.';
      case 'network-request-failed':
        return 'No internet connection.';
    }
    return err.message ?? err.code;
  }
  final s = err.toString();
  final key = s.startsWith('core.err.') ? s.substring(9) : null;
  if (key != null) return _errors[key] ?? 'Something went wrong ($key).';
  if (err is FirebaseException) {
    switch (err.code) {
      case 'permission-denied':
        return "You don't have access to this data. Ask the super admin to check your Module Access.";
      case 'unavailable':
        return "Couldn't reach the server. Check your connection and try again.";
      case 'failed-precondition':
        return 'The server is still preparing this list. Try again in a minute.';
      case 'unauthenticated':
        return 'Please sign in again.';
    }
    return err.message ?? err.code;
  }
  return s;
}
