import { ObjectId } from 'mongodb';

export interface Question {
    _id?: ObjectId;
    typeInput?: typeInput;
    title: string;
    subtitle?: string;
    placeholder?: string;
    options?: { title: string, img?: string }[];
    required?: boolean;
    orderNumber?: number;
    createdAt: Date;
    // image_url?: string;
}

export enum typeInput {
    AREA = 'area',
    INPUT = 'input',
    SELECT = 'select'
}

export interface User {
    _id?: ObjectId;
    email: string;
    name: string;
    username: string;
    password: string;
    answers: { questionId: string, response: string }[];
    namingThreadId:string
    createdAt: Date;
    _v: number;
}
