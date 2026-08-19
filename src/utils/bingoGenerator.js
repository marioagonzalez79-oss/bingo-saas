// Función para generar números aleatorios dentro de un rango específico sin repetir
function getRandomNumbers(min, max, count) {
  const numbers = [];
  while (numbers.length < count) {
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!numbers.includes(num)) {
      numbers.push(num);
    }
  }
  return numbers.sort((a, b) => a - b);
}

// Generador de un cartón tradicional de bingo (90 bolas o formato estándar)
function generateBingoCard() {
  // Ejemplo de estructura de cartón: Columnas con rangos (1-19, 20-39, etc.)
  // O una selección de 15 números únicos distribuidos del 1 al 90.
  const cardNumbers = getRandomNumbers(1, 90, 15);
  
  // Puedes estructurarlo como un JSON ordenado para guardarlo en la base de datos
  return {
    numbers: cardNumbers,
    distributed_grid: {
      column_1: cardNumbers.slice(0, 3),
      column_2: cardNumbers.slice(3, 6),
      column_3: cardNumbers.slice(6, 9),
      column_4: cardNumbers.slice(9, 12),
      column_5: cardNumbers.slice(12, 15)
    }
  };
}

module.exports = { generateBingoCard };