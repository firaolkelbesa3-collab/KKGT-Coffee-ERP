import React, { useState } from 'react';
import PageHeader from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Package, ShoppingBag } from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import ExportMaterialsTab from '@/components/materials/ExportMaterialsTab';
import GeneralPurchaseTab from '@/components/materials/GeneralPurchaseTab';

export default function MaterialsRegister() {
  const [tab, setTab] = useState('export');

  return (
    <RoleGuard allowedRoles={['admin', 'export_manager']}>
      <div>
        <PageHeader
          title="Materials Register"
          description="Track export packaging inventory and general purchases"
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 bg-muted/60">
            <TabsTrigger value="export" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <Package className="w-4 h-4" /> Export Materials
            </TabsTrigger>
            <TabsTrigger value="general" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <ShoppingBag className="w-4 h-4" /> General Purchase
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="mt-0">
            <ExportMaterialsTab />
          </TabsContent>

          <TabsContent value="general" className="mt-0">
            <GeneralPurchaseTab />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}