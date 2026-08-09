import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ATTACHMENT_MANAGER_EVENT,
  type AttachmentManagerDetail,
} from '@/shared/lib/attachment-events';

const AttachmentManagerDialog = lazy(() =>
  import('./AttachmentManagerDialog').then((m) => ({
    default: m.AttachmentManagerDialog,
  })),
);

/** 常驻监听命令式事件，附件管理的列表与 Dialog 仅在首次打开时下载。 */
export function AttachmentManagerDialogGate() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AttachmentManagerDetail>({});
  const everOpened = useRef(false);

  useEffect(() => {
    const onOpen = (event: Event) => {
      setDetail(
        (event as CustomEvent<AttachmentManagerDetail | undefined>).detail ?? {},
      );
      setOpen(true);
    };
    window.addEventListener(ATTACHMENT_MANAGER_EVENT, onOpen);
    return () => window.removeEventListener(ATTACHMENT_MANAGER_EVENT, onOpen);
  }, []);

  if (open) everOpened.current = true;
  if (!everOpened.current) return null;

  return (
    <Suspense fallback={null}>
      <AttachmentManagerDialog
        open={open}
        detail={detail}
        onOpenChange={setOpen}
      />
    </Suspense>
  );
}
