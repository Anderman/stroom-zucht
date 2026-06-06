export const statNumberFormatter = new Intl.NumberFormat('nl-NL', {
  maximumFractionDigits: 1,
});

export const oneDecimalFormatter = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const euroFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
