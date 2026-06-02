/** Types generated for queries found in "src/repositories/users.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'FindUserById' parameters type */
export interface IFindUserByIdParams {
  id?: string | null | void;
}

/** 'FindUserById' return type */
export interface IFindUserByIdResult {
  created_at: Date;
  email: string;
  id: string;
}

/** 'FindUserById' query type */
export interface IFindUserByIdQuery {
  params: IFindUserByIdParams;
  result: IFindUserByIdResult;
}

const findUserByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":false,"transform":{"type":"scalar"},"locs":[{"a":51,"b":53}]}],"statement":"SELECT id, email, created_at FROM users WHERE id = :id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, email, created_at FROM users WHERE id = :id
 * ```
 */
export const findUserById = new PreparedQuery<IFindUserByIdParams,IFindUserByIdResult>(findUserByIdIR);


/** 'FindAllUsers' parameters type */
export type IFindAllUsersParams = void;

/** 'FindAllUsers' return type */
export interface IFindAllUsersResult {
  created_at: Date;
  email: string;
  id: string;
}

/** 'FindAllUsers' query type */
export interface IFindAllUsersQuery {
  params: IFindAllUsersParams;
  result: IFindAllUsersResult;
}

const findAllUsersIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT id, email, created_at FROM users"};

/**
 * Query generated from SQL:
 * ```
 * SELECT id, email, created_at FROM users
 * ```
 */
export const findAllUsers = new PreparedQuery<IFindAllUsersParams,IFindAllUsersResult>(findAllUsersIR);


/** 'CreateUser' parameters type */
export interface ICreateUserParams {
  email?: string | null | void;
}

/** 'CreateUser' return type */
export interface ICreateUserResult {
  created_at: Date;
  email: string;
  id: string;
}

/** 'CreateUser' query type */
export interface ICreateUserQuery {
  params: ICreateUserParams;
  result: ICreateUserResult;
}

const createUserIR: any = {"usedParamSet":{"email":true},"params":[{"name":"email","required":false,"transform":{"type":"scalar"},"locs":[{"a":34,"b":39}]}],"statement":"INSERT INTO users (email) VALUES (:email) RETURNING id, email, created_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO users (email) VALUES (:email) RETURNING id, email, created_at
 * ```
 */
export const createUser = new PreparedQuery<ICreateUserParams,ICreateUserResult>(createUserIR);


