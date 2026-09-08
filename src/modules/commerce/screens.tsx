import { createCartScreen } from './cart/screen';
import type { CartStore } from './CartStore';
import { createCatalogScreens } from './catalog/screens';
import { createCheckoutScreen } from './checkout/screen';
import type { PaymentLauncher } from './payment';
import type { CommerceRepository } from './repository';
interface CommerceScreens {
  ProductListScreen(): React.JSX.Element;
  ProductDetailScreen(): React.JSX.Element;
  CartScreen(): React.JSX.Element;
  CheckoutScreen(): React.JSX.Element;
}

export function createCommerceScreens(
  repository: CommerceRepository,
  cart: CartStore,
  paymentLauncher: PaymentLauncher,
): CommerceScreens {
  return {
    ...createCatalogScreens(repository, cart),
    CartScreen: createCartScreen(cart),
    CheckoutScreen: createCheckoutScreen(repository, cart, paymentLauncher),
  };
}
