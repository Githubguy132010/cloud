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
    <header className="@container bg-background sticky top-0 z-10 h-14 shrink-0 border-b flex flex-row">
      <div className="flex flex-row">
        <div className="flex h-14 items-center gap-2 aspect-square justify-center">
          <SidebarTrigger className="-ml-1" />
        </div>
        <Separator orientation="vertical" className="h-4 @min-[1224]:hidden" />
      </div>

      <div className="absolute w-full h-full">
        {title && (
          <div className="mx-auto flex h-full w-full max-w-285 items-center gap-2 pl-18 @min-[1224]:pl-6">
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
      </div>
    </header>
  );
}
