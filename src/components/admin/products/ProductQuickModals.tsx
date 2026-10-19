import React from 'react';
import { Product } from '../../../types';
import { ProductFormState, SupplyFields } from './ProductFormModal';
import { Trash2, X } from 'lucide-react';
import { Modal } from '../AdminUI';
import { useDialog } from '../../../hooks/useDialog';

interface ProductQuickModalsProps {
  deleteConfirmTarget: { id: string; model: string } | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  quickSupplyProduct: Product | null;
  form: ProductFormState;
  onChangeForm: (updates: Partial<ProductFormState>) => void;
  onSaveQuickSupply: (e: React.FormEvent) => void;
  onCloseQuickSupply: () => void;
  previewVideoModal: string | null;
  onClosePreviewVideo: () => void;
}

export const ProductQuickModals: React.FC<ProductQuickModalsProps> = ({
  deleteConfirmTarget,
  onCancelDelete,
  onConfirmDelete,
  quickSupplyProduct,
  form,
  onChangeForm,
  onSaveQuickSupply,
  onCloseQuickSupply,
  previewVideoModal,
  onClosePreviewVideo
}) => (
  <>
    <Modal
      open={!!deleteConfirmTarget}
      onClose={onCancelDelete}
      size="sm"
      title="删除这款商品？"
      footer={
        <>
          <button type="button" onClick={onCancelDelete} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="button" onClick={onConfirmDelete} className="btn btn-sm btn-danger">
            <Trash2 className="w-4 h-4" />
            删除
          </button>
        </>
      }
    >
      {deleteConfirmTarget && (
        <p className="text-sm text-slate-600 leading-relaxed">
          <strong className="font-sign text-night">{deleteConfirmTarget.model}</strong> 会立即从官网下线，无法恢复。
        </p>
      )}
    </Modal>

    <Modal
      open={!!quickSupplyProduct}
      onClose={onCloseQuickSupply}
      title="供货信息"
      description={quickSupplyProduct && <span className="font-sign">{quickSupplyProduct.model}</span>}
      footer={
        <>
          <button type="button" onClick={onCloseQuickSupply} className="btn btn-sm btn-ghost">
            取消
          </button>
          <button type="submit" form="quick-supply-form" className="btn btn-sm btn-primary">
            保存
          </button>
        </>
      }
    >
      <form id="quick-supply-form" onSubmit={onSaveQuickSupply}>
        <SupplyFields form={form} onChangeForm={onChangeForm} />
      </form>
    </Modal>

    <VideoLightbox url={previewVideoModal} onClose={onClosePreviewVideo} />
  </>
);

const VideoLightbox: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  useDialog(!!url, onClose);
  if (!url) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="视频预览" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-night/80 animate-in" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 end-3 z-10 w-9 h-9 inline-flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="关闭视频"
        >
          <X className="w-4 h-4" />
        </button>
        <video src={url} controls autoPlay playsInline className="w-full aspect-video object-contain bg-black" />
      </div>
    </div>
  );
};
