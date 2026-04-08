import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface KesorAPIProductStatus {
  productId: string;
  isActive: boolean;
  gameName: string;
  productName: string;
}

interface UseKesorAPIProductStatusReturn {
  productStatuses: Map<string, KesorAPIProductStatus>;
  isLoading: boolean;
  checkProductStatus: (productId: string) => KesorAPIProductStatus | undefined;
  getInactiveProducts: () => KesorAPIProductStatus[];
}

export const useKesorAPIProductStatus = (): UseKesorAPIProductStatusReturn => {
  const [productStatuses, setProductStatuses] = useState<Map<string, KesorAPIProductStatus>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadProductStatuses();
  }, []);

  const loadProductStatuses = async () => {
    try {
      const { data, error } = await supabase
        .from('kesorapi_products')
        .select('kesorapi_product_id, is_active, game_name, product_name')
        .range(0, 4999);

      if (error) throw error;

      const statusMap = new Map<string, KesorAPIProductStatus>();
      (data || []).forEach(product => {
        statusMap.set(product.kesorapi_product_id, {
          productId: product.kesorapi_product_id,
          isActive: product.is_active ?? true,
          gameName: product.game_name,
          productName: product.product_name,
        });
      });

      setProductStatuses(statusMap);
    } catch (error) {
      console.error('Failed to load KesorAPI product statuses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkProductStatus = (productId: string): KesorAPIProductStatus | undefined => {
    return productStatuses.get(productId);
  };

  const getInactiveProducts = (): KesorAPIProductStatus[] => {
    return Array.from(productStatuses.values()).filter(p => !p.isActive);
  };

  return {
    productStatuses,
    isLoading,
    checkProductStatus,
    getInactiveProducts,
  };
};
