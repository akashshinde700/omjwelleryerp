'use client'
import { useState } from 'react'
import { PageHeader, ToneBadge } from '../shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ShoppingBag, Globe, Package, ShoppingCart, TrendingUp, Settings, ExternalLink } from 'lucide-react'
import { useApp } from '@/store/app'
import { toast } from 'sonner'

export function EcommerceModule() {
  const { activeFirmId } = useApp()
  const [enabled, setEnabled] = useState(false)
  const [storeName, setStoreName] = useState('OmGold Online Store')
  const [storeUrl, setStoreUrl] = useState('https://shop.omgold.in')
  const [syncStock, setSyncStock] = useState(true)

  return (
    <div>
      <PageHeader
        title="E-Commerce Admin"
        hindi="ई-कॉमर्स"
        desc="Manage your online jewellery store"
        actions={<Button variant="outline" size="sm" onClick={() => toast.info('Opening store URL…')}><ExternalLink className="size-4" /> View Store</Button>}
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Store Status</CardTitle>
            <Globe className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{enabled ? 'Live' : 'Offline'}</p>
                <p className="text-xs text-muted-foreground">{storeUrl}</p>
              </div>
              <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); toast.success(v ? 'Store is now live!' : 'Store is offline') }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Products Synced</CardTitle>
            <Package className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{syncStock ? '10' : '0'}</p>
            <p className="text-xs text-muted-foreground">{syncStock ? 'Auto-syncing from stock' : 'Manual mode'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Online Orders</CardTitle>
            <ShoppingCart className="size-4 text-violet-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-muted-foreground">No new orders</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="size-4 text-amber-600" /> Store Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Store Name</Label>
              <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Store URL</Label>
              <Input value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-sync Stock</Label>
              <p className="text-xs text-muted-foreground">Automatically sync inventory to online store</p>
            </div>
            <Switch checked={syncStock} onCheckedChange={setSyncStock} />
          </div>
          <Button className="btn-brand" onClick={() => toast.success('Settings saved')}>Save Settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4 text-amber-600" /> Online Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <ShoppingBag className="size-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No online orders yet</p>
            <p className="text-xs mt-1">When customers place orders on your online store, they'll appear here</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => toast.info('Enable e-commerce integration in production')}>Setup E-Commerce Integration</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
