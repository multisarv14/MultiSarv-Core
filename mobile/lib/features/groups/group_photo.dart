import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

/// Group photo nivadne — camera / gallery (WhatsApp sarkha), 512px JPEG (server pan image tapasto).

enum PhotoSource { camera, gallery, remove }

/// Mool image kamal (resize nantar khup chhoti hote).
const groupPhotoMaxBytes = 10 * 1024 * 1024;

Future<PhotoSource?> pickPhotoSource(BuildContext context, {bool canRemove = false}) => showModalBottomSheet<PhotoSource>(
  context: context,
  builder: (ctx) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const ListTile(title: Text('Group photo', style: TextStyle(fontWeight: FontWeight.w700))),
        ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Camera'), onTap: () => Navigator.pop(ctx, PhotoSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Gallery'), onTap: () => Navigator.pop(ctx, PhotoSource.gallery)),
        if (canRemove)
          ListTile(
            leading: Icon(Icons.delete_outline_rounded, color: Theme.of(ctx).colorScheme.error),
            title: Text('Remove photo', style: TextStyle(color: Theme.of(ctx).colorScheme.error)),
            onTap: () => Navigator.pop(ctx, PhotoSource.remove),
          ),
      ],
    ),
  ),
);

/// Nivadleli image (chhoti JPEG) kinva null.
Future<File?> pickGroupPhoto(PhotoSource src) async {
  final x = await ImagePicker().pickImage(
    source: src == PhotoSource.camera ? ImageSource.camera : ImageSource.gallery,
    maxWidth: 512,
    maxHeight: 512,
    imageQuality: 85,
  );
  if (x == null) return null;
  final f = File(x.path);
  if (await f.length() > groupPhotoMaxBytes) return null;
  return f;
}
