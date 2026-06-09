import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui';

interface CarouselProps {
  children: React.ReactNode;
  containerClassName?: string;
  contentClassName?: string;
}

export function Carousel({ children, containerClassName = '', contentClassName = 'gap-6 pb-6' }: CarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setShowLeftArrow(scrollLeft > 0);
    // Use a small threshold to account for decimal pixel values
    setShowRightArrow(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const { current } = scrollContainerRef;
    const scrollAmount = current.clientWidth * 0.75; // Scroll by 75% of container width
    
    current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  useEffect(() => {
    handleScroll(); // Initial check
    window.addEventListener('resize', handleScroll);
    return () => window.removeEventListener('resize', handleScroll);
  }, [children]);

  return (
    <div className={`relative group/carousel -mx-8 px-8 lg:-mx-12 lg:px-12 ${containerClassName}`}>
      {/* Left Arrow */}
      {showLeftArrow && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('left')}
          className="absolute left-0 top-0 bottom-6 z-10 w-12 h-auto !rounded-none bg-black/60 hover:bg-black/80 flex items-center justify-center text-white opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 backdrop-blur-sm"
          aria-label="Scroll left"
        >
          <ChevronLeft size={36} />
        </Button>
      )}

      {/* Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex overflow-x-auto scroll-smooth ${contentClassName}`}
        style={{ scrollbarWidth: 'none' }}
      >
        {children}
      </div>

      {/* Right Arrow */}
      {showRightArrow && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll('right')}
          className="absolute right-0 top-0 bottom-6 z-10 w-12 h-auto !rounded-none bg-black/60 hover:bg-black/80 flex items-center justify-center text-white opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 backdrop-blur-sm"
          aria-label="Scroll right"
        >
          <ChevronRight size={36} />
        </Button>
      )}
    </div>
  );
}
