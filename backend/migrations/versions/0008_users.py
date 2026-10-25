"""users (qv-auth)

The table the shared qv-auth module keeps: who signed in, whether an
administrator approved them. Matches qv-auth's SCHEMA.sql.

Revision ID: 0008_users
Revises: 0007_card_purchase_no_paid
Create Date: 2026-10-25 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '0008_users'
down_revision: Union[str, None] = '0007_card_purchase_no_paid'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), sa.Identity(always=False), primary_key=True),
        sa.Column('email', sa.Text(), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('given_name', sa.Text(), nullable=True),
        sa.Column('family_name', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='pending', nullable=False),
        sa.Column('is_admin', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('decided_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['decided_by_id'], ['fisac.users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('email', name='uq_users_email'),
        sa.CheckConstraint("status in ('pending', 'approved', 'rejected')", name='ck_users_status'),
        schema='fisac',
    )


def downgrade() -> None:
    op.drop_table('users', schema='fisac')
