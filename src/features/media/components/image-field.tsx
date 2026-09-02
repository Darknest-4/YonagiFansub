'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { Modal } from '@/shared/ui/modal';
import { MediaLibrary, type MediaAssetView } from '@/features/media/components/media-library';

/**
 * Image URL field with a library picker.
 *
 * The text input stays authoritative and editable: cover art is often hosted
 * externally, and a field that only accepts uploads would force a workflow the
 * team has not asked for. The picker fills the input; it does not replace it.
 *
 * The preview is what makes the field honest — a typo'd URL looks identical to a
 * correct one until something renders it, and finding that out on the public
 * page is finding out too late.
 */
export function ImageField({
  label,
  value,
  onChange,
  folder,
  hint,
  error,
  placeholder = 'https://… vagy /uploads/…',
  aspect = 'video',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Pre-selects the media library folder for uploads made from this field. */
  folder?: string;
  hint?: string;
  error?: string | string[];
  placeholder?: string;
  aspect?: 'video' | 'poster' | 'square';
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const aspectClass = {
    video: 'aspect-16/9',
    poster: 'aspect-2/3',
    square: 'aspect-square',
  }[aspect];

  return (
    <>
      <Field label={label} hint={hint} error={error} optionalLabel>
        {({ id, describedBy, invalid }) => (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                value={value}
                onChange={(event) => {
                  setFailed(false);
                  onChange(event.target.value);
                }}
                placeholder={placeholder}
                inputSize="sm"
                className="flex-1"
              />
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<ImagePlus className="size-4" aria-hidden />}
                onClick={() => setPickerOpen(true)}
              >
                Médiatár
              </Button>
            </div>

            {value && (
              <div
                className={cn(
                  'relative w-full max-w-56 overflow-hidden rounded-lg border border-ink-800 bg-ink-850',
                  aspectClass,
                )}
              >
                {failed ? (
                  <p className="absolute inset-0 flex items-center justify-center p-3 text-center text-2xs text-danger-400">
                    A kép nem tölthető be erről az URL-ről.
                  </p>
                ) : (
                  <Image
                    src={value}
                    alt=""
                    fill
                    sizes="224px"
                    className="object-cover"
                    onError={() => setFailed(true)}
                    // Arbitrary external hosts are not in `next.config` remote
                    // patterns, and adding a wildcard there would turn our
                    // optimiser into an open image proxy.
                    unoptimized
                  />
                )}

                <Button
                  size="icon-sm"
                  variant="danger"
                  className="absolute top-1.5 right-1.5"
                  onClick={() => {
                    setFailed(false);
                    onChange('');
                  }}
                  aria-label="Kép eltávolítása"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        size="xl"
        title="Médiatár"
        description="Válassz egy meglévő képet, vagy tölts fel újat. A kiválasztott kép URL-je a mezőbe kerül."
      >
        <MediaLibrary
          folder={folder}
          onPick={(asset: MediaAssetView) => {
            setFailed(false);
            onChange(asset.url);
            setPickerOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
