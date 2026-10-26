export const seed = {
  settings: {
    name: 'Aurel',
    tagline: 'Objects to live with.',
    description: 'Considered pieces for everyday rituals. Explore a collection of warm textures, quiet forms, and things worth keeping.',
    currency: 'USD',
    announcement: 'A considered collection for the everyday',
    about: 'Aurel brings together simple forms and tactile materials for a home that feels like you. Fewer things, chosen well.'
  },
  products: [
    { id: 'form-vase', name: 'Form ceramic vase', category: 'Objects', price: 68, stock: 12, status: 'active', featured: true, description: 'A soft, sculptural silhouette in warm ivory. Beautiful on its own, or with a few stems gathered along the way. A quiet focal point for a shelf, table, or favourite corner.', details: 'Ivory ceramic · 24 cm high\nWipe clean with a soft, damp cloth.', image: '/assets/vase.png', createdAt: '2026-10-01T10:00:00.000Z' },
    { id: 'amber-candle', name: 'Amber scented candle', category: 'Fragrance', price: 38, stock: 24, status: 'active', featured: true, description: 'A little warmth for slower evenings. A deep amber vessel, a soft glow, and a comforting scent to settle into at the end of the day.', details: 'Amber glass · 220 g\nNever leave a burning candle unattended.', image: '/assets/candle.png', createdAt: '2026-10-02T10:00:00.000Z' },
    { id: 'walnut-bowl', name: 'Walnut serving bowl', category: 'Table', price: 54, stock: 8, status: 'active', featured: false, description: 'Rich walnut tones and a generous, rounded shape. Made for the centre of the table, from unhurried breakfasts to evenings with friends.', details: 'Walnut wood · 28 cm diameter\nHand wash gently. Dry immediately.', image: '/assets/bowl.png', createdAt: '2026-10-03T10:00:00.000Z' },
    { id: 'linen-throw', name: 'Everyday linen throw', category: 'Textiles', price: 96, stock: 6, status: 'active', featured: true, description: 'An easy layer of natural texture. Soft oatmeal linen with a simple fringed edge, ready to drape across your sofa or keep close on cooler mornings.', details: 'Oatmeal linen · 130 × 170 cm\nGentle cold wash. Air dry.', image: '/assets/throw.png', createdAt: '2026-10-04T10:00:00.000Z' }
  ]
};
