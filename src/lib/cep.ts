export interface CepResult {
  street:       string
  neighborhood: string
  city:         string
  state:        string
}

export async function fetchAddressByCep(rawCep: string): Promise<CepResult> {
  const cep = rawCep.replace(/\D/g, '')
  if (cep.length !== 8) throw new Error('CEP deve ter 8 dígitos')

  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
  if (!res.ok) throw new Error('Erro ao consultar CEP')

  const data = await res.json()
  if (data.erro) throw new Error('CEP não encontrado')

  return {
    street:       data.logradouro ?? '',
    neighborhood: data.bairro     ?? '',
    city:         data.localidade ?? '',
    state:        data.uf         ?? '',
  }
}
