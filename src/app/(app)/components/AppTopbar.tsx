'use client';

import { usePageTitle } from '@/contexts/PageTitleContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

export function AppTopbar() {
  const { title, icon, extras, hidden } = usePageTitle();

  if (hidden) return null;

  return (
    <header className="bg-background sticky top-0 z-10 h-14 shrink-0 border-b">
      {/* Sidebar trigger pinned to the left edge */}
      <div className="absolute left-4 top-0 z-10 flex h-14 items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
      </div>

      {/* Padding mirrors PageContainer centering; max() ensures trigger clearance */}
      {title && (
        <div className="flex h-full w-full items-center gap-2 pl-[max(2.75rem,calc((100%-1140px)/2+1rem))] pr-[max(1rem,calc((100%-1140px)/2+1rem))] md:pl-[max(2.75rem,calc((100%-1140px)/2+1.5rem))] md:pr-[max(1.5rem,calc((100%-1140px)/2+1.5rem))]">
          {icon}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          {extras}
        </div>
      )}
    </header>
  );
}
