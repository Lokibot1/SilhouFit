const PESO = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

/** 1890 -> "₱1,890.00". */
export const formatPeso = (amount: number) => PESO.format(amount)
