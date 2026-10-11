# ADR-004 — Estratégia de matching

**Status:** aceito · **Data:** 2026-10-06

## Decisão

O matching é feito por um algoritmo **determinístico e explicável**, sem machine learning no MVP.

1. **Filtros duros** (o que importa em app de namoro):
   - interesse mútuo de gênero;
   - idade dentro da faixa dos dois;
   - distância dentro do raio dos dois **ou** Modo Lotação;
   - pelo menos 1 foto;
   - exclusão de bloqueados, de já vistos e de matches existentes;
   - exclusão de perfis inativos há mais de 30 dias.
2. **Compatibilidade (0–100)** como **desempate** e assunto de conversa. Os pesos ficam em `matching_weights`:

| Fator | Peso |
|---|---|
| mesmo_concurso | 30 |
| mesma_area | 20 |
| proximidade | 20 |
| mesmo_periodo | 10 |
| fase_parecida | 10 |
| lotacao | 10 |

3. **Ordenação:** compatibilidade e, em seguida, atividade recente.

## Por quê

Aparência, idade e distância decidem o like. O concurso é o diferencial de identidade e o quebra-gelo, não um filtro.

Pesos em tabela permitem testes A/B por `UPDATE`, sem deploy, e ficam centralizados num único lugar, como pede o requisito.

## Evolução

Um ML só faz sentido com dados reais. Por exemplo: taxa de like recíproco por par de atributos, ou "elo" de desejabilidade, para evitar que poucos perfis concentrem todos os likes.

O gatilho é ter mais de 100 mil swipes registrados.
