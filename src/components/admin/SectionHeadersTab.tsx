import React, { useState } from 'react';
import { Type, Palette, Eye, Save, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useSite } from '@/contexts/SiteContext';
import { toast } from '@/hooks/use-toast';
import SectionHeader from '@/components/SectionHeader';
import { Crown, Gamepad2 } from 'lucide-react';

interface SectionHeaderConfig {
  titleColor: string;
  subtitleColor: string;
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
  lineColor: string;
  dotColor: string;
}

const defaultHeaderConfig: SectionHeaderConfig = {
  titleColor: '',
  subtitleColor: '',
  bgColor: '',
  borderColor: '',
  borderWidth: 0,
  borderRadius: 0,
  paddingX: 0,
  paddingY: 0,
  lineColor: '',
  dotColor: '',
};

const SectionHeadersTab: React.FC = () => {
  const { settings, updateSettings } = useSite();
  
  // Get current config from settings or use defaults
  const currentConfig: SectionHeaderConfig = {
    titleColor: settings.sectionHeaderTitleColor || '',
    subtitleColor: settings.sectionHeaderSubtitleColor || '',
    bgColor: settings.sectionHeaderBgColor || '',
    borderColor: settings.sectionHeaderBorderColor || '',
    borderWidth: settings.sectionHeaderBorderWidth || 0,
    borderRadius: settings.sectionHeaderBorderRadius || 0,
    paddingX: settings.sectionHeaderPaddingX || 0,
    paddingY: settings.sectionHeaderPaddingY || 0,
    lineColor: settings.sectionHeaderLineColor || '',
    dotColor: settings.sectionHeaderDotColor || '',
  };

  const [config, setConfig] = useState<SectionHeaderConfig>(currentConfig);

  const handleSave = () => {
    updateSettings({
      sectionHeaderTitleColor: config.titleColor,
      sectionHeaderSubtitleColor: config.subtitleColor,
      sectionHeaderBgColor: config.bgColor,
      sectionHeaderBorderColor: config.borderColor,
      sectionHeaderBorderWidth: config.borderWidth,
      sectionHeaderBorderRadius: config.borderRadius,
      sectionHeaderPaddingX: config.paddingX,
      sectionHeaderPaddingY: config.paddingY,
      sectionHeaderLineColor: config.lineColor,
      sectionHeaderDotColor: config.dotColor,
    });
    toast({ title: '✓ Section header styles saved!' });
  };

  const handleReset = () => {
    setConfig(defaultHeaderConfig);
    toast({ title: 'Reset to defaults' });
  };

  const updateConfig = (key: keyof SectionHeaderConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Live Preview */}
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-gold" />
            Live Preview
          </CardTitle>
          <CardDescription>See changes in real-time</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div 
            className="p-4 rounded-lg"
            style={{
              backgroundColor: config.bgColor || 'transparent',
              border: config.borderWidth > 0 ? `${config.borderWidth}px solid ${config.borderColor || 'transparent'}` : 'none',
              borderRadius: config.borderRadius,
              padding: `${config.paddingY}px ${config.paddingX}px`,
            }}
          >
            <SectionHeader 
              title="ហ្គេមពេញនិយម"
              subtitle="Featured Games Subtitle"
              icon={Crown}
              previewStyles={{
                titleColor: config.titleColor,
                subtitleColor: config.subtitleColor,
                lineColor: config.lineColor,
                dotColor: config.dotColor,
              }}
            />
          </div>
          <div 
            className="p-4 rounded-lg"
            style={{
              backgroundColor: config.bgColor || 'transparent',
              border: config.borderWidth > 0 ? `${config.borderWidth}px solid ${config.borderColor || 'transparent'}` : 'none',
              borderRadius: config.borderRadius,
              padding: `${config.paddingY}px ${config.paddingX}px`,
            }}
          >
            <SectionHeader 
              title="ហ្គេមទាំងអស់"
              subtitle="All Games Section"
              icon={Gamepad2}
              previewStyles={{
                titleColor: config.titleColor,
                subtitleColor: config.subtitleColor,
                lineColor: config.lineColor,
                dotColor: config.dotColor,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Color Settings */}
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-gold" />
            Colors
          </CardTitle>
          <CardDescription>Customize text and decoration colors</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Title Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={config.titleColor || '#ffffff'}
                onChange={(e) => updateConfig('titleColor', e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={config.titleColor}
                onChange={(e) => updateConfig('titleColor', e.target.value)}
                placeholder="Default (foreground)"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Subtitle Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={config.subtitleColor || '#888888'}
                onChange={(e) => updateConfig('subtitleColor', e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={config.subtitleColor}
                onChange={(e) => updateConfig('subtitleColor', e.target.value)}
                placeholder="Default (muted-foreground)"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Decorative Line Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={config.lineColor || '#d4a84b'}
                onChange={(e) => updateConfig('lineColor', e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={config.lineColor}
                onChange={(e) => updateConfig('lineColor', e.target.value)}
                placeholder="Default (gold)"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Decorative Dot Color</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                value={config.dotColor || '#d4a84b'}
                onChange={(e) => updateConfig('dotColor', e.target.value)}
                className="w-14 h-10 p-1 cursor-pointer"
              />
              <Input
                value={config.dotColor}
                onChange={(e) => updateConfig('dotColor', e.target.value)}
                placeholder="Default (gold)"
                className="flex-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Background & Border */}
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5 text-gold" />
            Background & Border
          </CardTitle>
          <CardDescription>Container styling for section headers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Background Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={config.bgColor || '#000000'}
                  onChange={(e) => updateConfig('bgColor', e.target.value)}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={config.bgColor}
                  onChange={(e) => updateConfig('bgColor', e.target.value)}
                  placeholder="Transparent"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Border Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={config.borderColor || '#d4a84b'}
                  onChange={(e) => updateConfig('borderColor', e.target.value)}
                  className="w-14 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={config.borderColor}
                  onChange={(e) => updateConfig('borderColor', e.target.value)}
                  placeholder="No border"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Border Width: {config.borderWidth}px</Label>
              <Slider
                value={[config.borderWidth]}
                onValueChange={([value]) => updateConfig('borderWidth', value)}
                min={0}
                max={10}
                step={1}
              />
            </div>

            <div className="space-y-2">
              <Label>Border Radius: {config.borderRadius}px</Label>
              <Slider
                value={[config.borderRadius]}
                onValueChange={([value]) => updateConfig('borderRadius', value)}
                min={0}
                max={32}
                step={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Horizontal Padding: {config.paddingX}px</Label>
              <Slider
                value={[config.paddingX]}
                onValueChange={([value]) => updateConfig('paddingX', value)}
                min={0}
                max={64}
                step={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Vertical Padding: {config.paddingY}px</Label>
              <Slider
                value={[config.paddingY]}
                onValueChange={([value]) => updateConfig('paddingY', value)}
                min={0}
                max={48}
                step={4}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} className="bg-gold hover:bg-gold/90 text-primary-foreground">
          <Save className="w-4 h-4 mr-2" />
          Save Changes
        </Button>
        <Button onClick={handleReset} variant="outline">
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
};

export default SectionHeadersTab;
