import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast/useToast'
import { addCartItem } from '../service/cartApi'
import { ProductListError } from '../service/fetchProductList'
import type { CustomerOrder } from '../service/ordersApi'
import { itemsLabel } from '../utils/format'
import { useCart } from './useCart'

/**
 * Buy again: puts an order's pieces back in the cart, one by one, then opens the cart. A piece whose variant is gone
 * (no variant id) is skipped, and one the cart refuses (out of stock) is reported with the shop's reason. `busy` is the
 * id of the order being added, so only its button waits.
 */
export function useBuyAgain() {
  const navigate = useNavigate()
  const toast = useToast()
  const cart = useCart()
  const [busy, setBusy] = useState<string | null>(null)

  async function buyAgain(order: CustomerOrder) {
    if (busy) return
    setBusy(order.id)
    const failed: string[] = []
    let added = 0
    for (const item of order.items) {
      if (!item.variantId) {
        failed.push(`${item.name} is no longer sold`)
        continue
      }
      try {
        await addCartItem(item.variantId, item.qty)
        added += 1
      } catch (failure) {
        const why = failure instanceof ProductListError && failure.detail ? failure.detail : 'it could not be added'
        failed.push(`${item.name}: ${why}`)
      }
    }
    // The cart held in memory did not see these changes.
    cart.retry()
    setBusy(null)
    if (failed.length > 0) {
      toast.show({ kind: added > 0 ? 'info' : 'error', message: `${added > 0 ? `Added ${itemsLabel(added)} to your cart, but not` : "Couldn't add to your cart:"} ${failed.join('; ')}.` })
    } else {
      toast.show({ kind: 'success', message: `Added ${itemsLabel(added)} to your cart.` })
    }
    if (added > 0) navigate('/cart')
  }

  return { busy, buyAgain }
}
