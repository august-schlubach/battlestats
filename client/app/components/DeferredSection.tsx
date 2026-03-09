import React, { useEffect, useRef, useState } from 'react';

interface DeferredSectionProps {
    children: React.ReactNode;
    className?: string;
    minHeight?: number;
    placeholder?: React.ReactNode;
    rootMargin?: string;
}

const DeferredSection: React.FC<DeferredSectionProps> = ({
    children,
    className,
    minHeight = 240,
    placeholder,
    rootMargin = '240px 0px',
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
        if (shouldRender) {
            return;
        }

        const node = containerRef.current;
        if (!node || typeof IntersectionObserver === 'undefined') {
            setShouldRender(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShouldRender(true);
                    observer.disconnect();
                }
            },
            { rootMargin },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [rootMargin, shouldRender]);

    return (
        <div ref={containerRef} className={className}>
            {shouldRender ? children : placeholder ?? <div className="animate-pulse rounded-md border border-[#dbe9f6] bg-[#f7fbff]" style={{ minHeight }} />}
        </div>
    );
};

export default DeferredSection;