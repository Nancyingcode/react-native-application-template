export interface ShippingAddress {
  recipient: string;
  phone: string;
  province: string;
  city: string;
  district?: string;
  addressLine: string;
  postalCode?: string;
}
export type ShippingAddressDraft = Partial<ShippingAddress>;
export type ShippingAddressErrors = Partial<
  Record<keyof ShippingAddress, string>
>;
export type ShippingAddressValidation =
  | { valid: true; value: ShippingAddress }
  | { valid: false; errors: ShippingAddressErrors };
export interface ShippingAddressFormProps {
  value: ShippingAddressDraft;
  errors?: ShippingAddressErrors;
  disabled?: boolean;
  onChange(value: ShippingAddressDraft): void;
}
export const shippingAddressFields = [
  { name: 'recipient', maxLength: 100, required: true },
  { name: 'phone', maxLength: 32, required: true },
  { name: 'province', maxLength: 100, required: true },
  { name: 'city', maxLength: 100, required: true },
  { name: 'district', maxLength: 100, required: false },
  { name: 'addressLine', maxLength: 300, required: true },
  { name: 'postalCode', maxLength: 20, required: false },
] as const;

export function validateShippingAddress(
  draft: ShippingAddressDraft,
  translate: (key: string) => string = key =>
    key === 'commerce.checkout.address.required'
      ? '请填写此项'
      : '内容超过长度限制',
): ShippingAddressValidation {
  const errors: ShippingAddressErrors = {};
  const value: ShippingAddress = {
    recipient: '',
    phone: '',
    province: '',
    city: '',
    addressLine: '',
  };
  for (const field of shippingAddressFields) {
    const input = draft[field.name];
    const text = typeof input === 'string' ? input.trim() : '';
    if (field.required && !text) {
      errors[field.name] = translate('commerce.checkout.address.required');
    } else if (text.length > field.maxLength) {
      errors[field.name] = translate('commerce.checkout.address.tooLong');
    }
    if (text) {
      value[field.name] = text;
    }
  }
  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, value };
}
