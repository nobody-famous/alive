import { Expr } from './Expr'

export interface NameValuePair {
    name: string
    value: Expr
}

export interface ExprMap {
    [index: string]: Expr
}
