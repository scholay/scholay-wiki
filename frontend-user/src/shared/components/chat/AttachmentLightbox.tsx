import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

/**
 * 图片放大预览 (lightbox) —— 复用 shared/ui/dialog (Radix), 不引第三方 lightbox 库。
 *
 * 受控用法: 传 src 即打开, src=null 关闭; onClose 在用户关弹层时回调清空。
 * 覆盖 DialogContent 默认的 max-w-lg / p-6 / 实底, 换成贴合图片的透明大容器
 * (cn 走 tailwind-merge, 后面的 className 覆盖前面的同属性)。
 */
export interface AttachmentLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

export function AttachmentLightbox({ src, alt, onClose }: AttachmentLightboxProps) {
  return (
    <Dialog
      open={!!src}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="w-auto max-w-[92vw] border-0 bg-transparent p-0 shadow-none sm:rounded-lg">
        {/* a11y: Radix Dialog 要求有 Title, 视觉隐藏即可 */}
        <DialogTitle className="sr-only">{alt || '图片预览'}</DialogTitle>
        {src && (
          <img
            src={src}
            alt={alt || '图片预览'}
            onClick={onClose}
            className="max-h-[85vh] max-w-[92vw] w-auto cursor-zoom-out rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
