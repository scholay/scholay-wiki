import React, { useEffect, useRef, useState, CSSProperties, ImgHTMLAttributes, SyntheticEvent } from 'react';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'placeholder' | 'onLoad' | 'onError'> {
  src?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  width?: number | string;
  height?: number | string;
  placeholder?: string;
  onLoad?: (e: SyntheticEvent<HTMLImageElement, Event>) => void;
  onError?: (e: SyntheticEvent<HTMLImageElement, Event>) => void;
  rootMargin?: string;
  eager?: boolean;
}

const LazyImage = React.memo(function LazyImage({
  src,
  alt = '',
  className,
  style,
  width,
  height,
  placeholder,
  onLoad,
  onError,
  rootMargin = '200px',
  eager = false,
  ...rest
}: LazyImageProps) {
  const [visible, setVisible] = useState<boolean>(eager);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [errored, setErrored] = useState<boolean>(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (eager || visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, visible, rootMargin]);

  const handleLoad = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    setErrored(true);
    onError?.(e);
  };

  return (
    <span
      ref={ref}
      className={className}
      style={{
        display: 'inline-block',
        position: 'relative',
        width,
        height,
        ...style,
      }}
    >
      {!loaded && !errored && placeholder ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: placeholder,
            transition: 'opacity 200ms',
          }}
        />
      ) : null}
      {visible ? (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 200ms',
          }}
          {...rest}
        />
      ) : null}
    </span>
  );
});

export default LazyImage;
