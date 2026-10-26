/** @module JSON-RPC 2.0 protocol models. */

export type JsonRpcId = number | string | null

export interface JsonRpcRequest {
  id?: JsonRpcId
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  data?: unknown
  message: string
}

export interface JsonRpcFailure {
  error: JsonRpcError
  id: JsonRpcId
  jsonrpc: "2.0"
}

export interface JsonRpcSuccess {
  id: JsonRpcId
  jsonrpc: "2.0"
  result: unknown
}

export type JsonRpcResponse = JsonRpcFailure | JsonRpcSuccess
