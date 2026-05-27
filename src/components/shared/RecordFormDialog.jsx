import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function RecordFormDialog({ open, onOpenChange, title, fields, initialData, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (open) {
      const defaults = {};
      fields.forEach(f => {
        defaults[f.name] = initialData?.[f.name] ?? f.default ?? '';
      });
      setFormData(defaults);
    }
  }, [open, initialData, fields]);

  const handleChange = (name, value) => {
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Auto-calculate total_cost for purchases
      if ((name === 'quantity_kg' || name === 'price_per_kg') && 'total_cost' in updated) {
        updated.total_cost = (parseFloat(updated.quantity_kg) || 0) * (parseFloat(updated.price_per_kg) || 0);
      }
      // Auto-calculate total_value_usd for exports
      if ((name === 'quantity_kg' || name === 'price_per_kg_usd') && 'total_value_usd' in updated) {
        updated.total_value_usd = (parseFloat(updated.quantity_kg) || 0) * (parseFloat(updated.price_per_kg_usd) || 0);
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleaned = { ...formData };
    fields.forEach(f => {
      if (f.type === 'number' && cleaned[f.name] !== '') {
        cleaned[f.name] = parseFloat(cleaned[f.name]);
      }
    });
    onSubmit(cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(field => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-xs font-medium">{field.label}</Label>
              {field.type === 'select' ? (
                <Select
                  value={formData[field.name] || ''}
                  onValueChange={(v) => handleChange(field.name, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : field.type === 'textarea' ? (
                <Textarea
                  value={formData[field.name] || ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                />
              ) : (
                <Input
                  type={field.type || 'text'}
                  value={formData[field.name] ?? ''}
                  onChange={(e) => handleChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  readOnly={field.readOnly}
                  step={field.type === 'number' ? 'any' : undefined}
                  className={field.readOnly ? 'bg-muted' : ''}
                />
              )}
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}